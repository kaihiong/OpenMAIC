/**
 * Fork: visual review of generated interactive pages.
 *
 * The page generator writes HTML it never sees, so "fill the frame", "do not
 * overflow" and "use the course language" are requests, not guarantees. This
 * module renders each page in headless Chromium at the classroom stage size,
 * the same way the classroom iframe does, measures what a teacher would notice,
 * and returns concrete problems plus a screenshot. The generator then gets ONE
 * repair pass (see `reviewInteractive` in @openmaic/generation).
 *
 * Enabled with OPENMAIC_INTERACTIVE_QA=true. Needs Playwright's Chromium on the
 * host; if it cannot launch, review is skipped and pages are kept as generated.
 */
import type {
  InteractiveRepairFn,
  InteractiveReview,
  InteractiveReviewFn,
} from '@openmaic/generation';

import { callLLM } from '@/lib/ai/llm';
import { resolveModel } from '@/lib/server/resolve-model';

import { createLogger } from '@/lib/logger';
import { patchHtmlForIframe } from '@/lib/utils/iframe';

const log = createLogger('InteractiveQA');

/** The classroom renders interactive pages on a 16:9 stage of this size. */
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;
const SETTLE_MS = 1200;
const LOAD_TIMEOUT_MS = 15_000;
const IDLE_CLOSE_MS = 60_000;
const MAX_PARALLEL = 2;

export function isInteractiveQaEnabled(): boolean {
  return process.env.OPENMAIC_INTERACTIVE_QA === 'true';
}

/** Spread into generateSceneContent options; empty when review is off. */
export function interactiveReviewOption(): {
  reviewInteractive?: InteractiveReviewFn;
  repairInteractive?: InteractiveRepairFn;
} {
  return isInteractiveQaEnabled()
    ? { reviewInteractive: reviewInteractivePage, repairInteractive: patchInteractivePage }
    : {};
}

/** Problems smaller than these are not worth a repair. */
const MIN_HIDDEN_PX = 40;
const MIN_OVERFLOW_PX = 12;

// ── Browser lifecycle: one shared Chromium, closed when idle ─────────────────

type Browser = { newContext: (o: object) => Promise<Context>; close: () => Promise<void> };
type Context = { newPage: () => Promise<Page>; close: () => Promise<void> };
type Page = {
  on: (event: string, cb: (arg: never) => void) => void;
  setContent: (html: string, o: object) => Promise<void>;
  waitForTimeout: (ms: number) => Promise<void>;
  evaluate: <T, A>(fn: (arg: A) => T, arg: A) => Promise<T>;
  screenshot: (o: object) => Promise<Buffer>;
};

let browserPromise: Promise<Browser> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let active = 0;
const waiters: Array<() => void> = [];

async function getBrowser(): Promise<Browser> {
  browserPromise ??= (async () => {
    // A variable specifier keeps bundlers from tracing Playwright into the app.
    const specifier = '@playwright/test';
    const { chromium } = (await import(/* webpackIgnore: true */ specifier)) as {
      chromium: { launch: (o: object) => Promise<Browser> };
    };
    return chromium.launch({ headless: true });
  })().catch((error) => {
    browserPromise = null;
    throw error;
  });
  return browserPromise;
}

function scheduleIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (active > 0 || !browserPromise) return;
    const closing = browserPromise;
    browserPromise = null;
    void closing.then((b) => b.close()).catch(() => {});
  }, IDLE_CLOSE_MS);
  idleTimer.unref?.();
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiters.shift()?.();
    scheduleIdleClose();
  }
}

// ── Canvas text probe (injected before the page's own scripts) ───────────────

/**
 * Records where canvas `fillText`/`strokeText` labels land, in CSS pixels, so the
 * overlap check also covers chart labels drawn on a canvas. A full-canvas
 * `clearRect` starts a new frame for that canvas, so only the latest drawing counts.
 */
const CANVAS_TEXT_PROBE = `<script data-qa-canvas-probe>
(function () {
  var frames = new Map();
  window.__qaCanvasText = function () {
    var out = [];
    frames.forEach(function (list, canvas) {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !canvas.width) return;
      var sx = rect.width / canvas.width, sy = rect.height / canvas.height;
      list.forEach(function (b) {
        out.push({ t: b.t, left: rect.left + b.x0 * sx, top: rect.top + b.y0 * sy,
                   right: rect.left + b.x1 * sx, bottom: rect.top + b.y1 * sy });
      });
    });
    return out;
  };
  var P = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  if (!P) return;
  var clear = P.clearRect;
  P.clearRect = function (x, y, w, h) {
    try {
      var m = this.getTransform();
      if (w * m.a >= this.canvas.width - 2 && h * m.d >= this.canvas.height - 2) frames.set(this.canvas, []);
    } catch (e) {}
    return clear.apply(this, arguments);
  };
  function wrap(name) {
    var orig = P[name];
    P[name] = function (text, x, y) {
      try {
        var s = String(text).trim();
        if (s.length > 0) {
          var mt = this.measureText(String(text)), m = this.getTransform();
          var x0 = x - (mt.actualBoundingBoxLeft || 0), x1 = x + (mt.actualBoundingBoxRight || mt.width);
          var y0 = y - (mt.actualBoundingBoxAscent || 0), y1 = y + (mt.actualBoundingBoxDescent || 0);
          var list = frames.get(this.canvas) || [];
          list.push({ t: s.slice(0, 40), x0: m.a * x0 + m.e, y0: m.d * y0 + m.f, x1: m.a * x1 + m.e, y1: m.d * y1 + m.f });
          if (list.length > 300) list.shift();
          frames.set(this.canvas, list);
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  }
  wrap('fillText'); wrap('strokeText');
})();
</script>`;

// ── The measurements (run inside the page) ────────────────────────────────────

export interface PageMeasurements {
  pageScrollY: number;
  pageScrollX: number;
  clippedPanels: { label: string; hiddenPx: number }[];
  offStage: { label: string; overflowRight: number; overflowBottom: number }[];
  lowContrast: { text: string; ratio: number; px: number }[];
  tinyText: { text: string; px: number }[];
  cjkSamples: string[];
  overlaps: { a: string; b: string }[];
  textLength: number;
  hasCanvasOrSvg: boolean;
  contentWidthRatio: number;
  contentHeightRatio: number;
}

/* c8 ignore start -- executed inside Chromium, exercised by the e2e check */
function measurePage(stage: { width: number; height: number }): PageMeasurements {
  const W = stage.width;
  const H = stage.height;
  const doc = document.documentElement;
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const label = (el: Element): string => {
    const id = el.id ? `#${el.id}` : '';
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    return `${el.tagName.toLowerCase()}${id}${text ? ` ("${text}…")` : ''}`;
  };
  const parse = (c: string): [number, number, number, number] | null => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const lum = ([r, g, b]: number[]): number => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el: Element | null): number[] | null => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradient/image: skip
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0.6) return c;
    }
    const bodyBg = parse(getComputedStyle(document.body).backgroundColor);
    return bodyBg && bodyBg[3] > 0.6 ? bodyBg : [255, 255, 255, 1];
  };

  const all = Array.from(document.body.querySelectorAll('*')).filter(
    (el) => !['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(el.tagName),
  );

  // Panels that hide content behind their own scrollbar.
  const clippedPanels: PageMeasurements['clippedPanels'] = [];
  for (const el of all) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (!/(auto|scroll|hidden)/.test(cs.overflowY)) continue;
    const hidden = el.scrollHeight - el.clientHeight;
    if (hidden > 12 && el.clientHeight > 80 && (el.textContent || '').trim().length > 0) {
      clippedPanels.push({ label: label(el), hiddenPx: hidden });
      el.setAttribute('data-qa-clipped', '');
    }
  }

  // Interactive or text elements that end outside the stage.
  const offStage: PageMeasurements['offStage'] = [];
  const lowContrast: PageMeasurements['lowContrast'] = [];
  const tinyText: PageMeasurements['tinyText'] = [];
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const meaningful =
      ownText.length > 0 || ['BUTTON', 'INPUT', 'SELECT', 'CANVAS', 'svg', 'IMG'].includes(el.tagName);
    if (!meaningful) continue;
    if (r.right > 0 && r.bottom > 0 && r.left < W && r.top < H) {
      minX = Math.min(minX, Math.max(0, r.left));
      minY = Math.min(minY, Math.max(0, r.top));
      maxX = Math.max(maxX, Math.min(W, r.right));
      maxY = Math.max(maxY, Math.min(H, r.bottom));
    }
    // Inside a clipped panel: already reported as that panel's hidden content.
    if ((r.right > W + 2 || r.bottom > H + 2) && !el.closest('[data-qa-clipped]')) {
      if (offStage.length < 6)
        offStage.push({
          label: label(el),
          overflowRight: Math.max(0, Math.round(r.right - W)),
          overflowBottom: Math.max(0, Math.round(r.bottom - H)),
        });
    }
    if (ownText.length > 1) {
      const cs = getComputedStyle(el);
      const px = parseFloat(cs.fontSize);
      if (px < 11 && tinyText.length < 5) tinyText.push({ text: ownText.slice(0, 40), px });
      const fg = parse(cs.color);
      const bg = bgOf(el);
      if (fg && bg && fg[3] > 0.3) {
        const a = fg[3];
        const mixed = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
        const l1 = lum(mixed), l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const large = px >= 18 || (px >= 14 && Number(cs.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5) && lowContrast.length < 6) {
          lowContrast.push({ text: ownText.slice(0, 40), ratio: Math.round(ratio * 10) / 10, px });
        }
      }
    }
  }

  // Text that collides with other text (HTML labels and SVG <text>).
  const textBoxes: { el: Element; r: DOMRect; t: string }[] = [];
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (textBoxes.length > 400) break;
    const isSvgText = el.tagName.toLowerCase() === 'text';
    const own = isSvgText
      ? (el.textContent || '').trim()
      : Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent || '')
          .join(' ')
          .trim();
    if (own.length < 2 || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    // Use the text's own line box: for block elements, measure the text range.
    let box = r;
    if (!isSvgText) {
      const range = document.createRange();
      const node = Array.from(el.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim(),
      );
      if (node) {
        range.selectNodeContents(node);
        const rr = range.getBoundingClientRect();
        if (rr.width > 2 && rr.height > 2) box = rr;
      }
    }
    textBoxes.push({ el, r: box, t: own.replace(/\s+/g, ' ').slice(0, 40) });
  }
  type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
  const probe = (window as unknown as { __qaCanvasText?: () => Array<Omit<Box, 'width' | 'height'> & { t: string }> })
    .__qaCanvasText;
  const canvasHost = document.createElement('div'); // stand-in element: never contains DOM text
  for (const c of probe ? probe() : []) {
    const r = { ...c, width: c.right - c.left, height: c.bottom - c.top } as Box as DOMRect;
    if (r.width > 2 && r.height > 2) textBoxes.push({ el: canvasHost.appendChild(document.createElement('i')), r, t: c.t });
  }
  const overlaps: PageMeasurements['overlaps'] = [];
  for (let i = 0; i < textBoxes.length && overlaps.length < 4; i++) {
    for (let j = i + 1; j < textBoxes.length && overlaps.length < 4; j++) {
      const A = textBoxes[i], B = textBoxes[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (w <= 2 || h <= 2) continue;
      // Glyph boxes are tight, so even a few pixels of shared height is visible:
      // flag when the overlap covers a fifth of the shorter label's height.
      const minH = Math.min(A.r.height, B.r.height);
      const minW = Math.min(A.r.width, B.r.width);
      if (h >= Math.max(2, minH * 0.2) && w >= Math.min(6, minW * 0.5)) overlaps.push({ a: A.t, b: B.t });
    }
  }

  const text = document.body.innerText || '';
  const cjk = text.match(/[぀-ヿ㐀-鿿가-힯]+/g) || [];
  return {
    pageScrollY: Math.max(0, doc.scrollHeight - H),
    pageScrollX: Math.max(0, doc.scrollWidth - W),
    clippedPanels: clippedPanels.slice(0, 4),
    offStage,
    lowContrast,
    tinyText,
    cjkSamples: Array.from(new Set(cjk)).slice(0, 8),
    overlaps,
    textLength: text.trim().length,
    hasCanvasOrSvg: !!document.querySelector('canvas, svg'),
    contentWidthRatio: maxX > minX ? (maxX - minX) / W : 0,
    contentHeightRatio: maxY > minY ? (maxY - minY) / H : 0,
  };
}
/* c8 ignore stop */

// ── Turning measurements into instructions ────────────────────────────────────

const CJK = /[぀-ヿ㐀-鿿가-힯]/;

/** Exported for tests: the issue list for a set of measurements. */
export function issuesFromMeasurements(
  m: PageMeasurements,
  context: { title: string },
  errors: string[],
): string[] {
  const issues: string[] = [];
  const stage = `${STAGE_WIDTH}×${STAGE_HEIGHT}`;
  if (m.pageScrollY > 4 || m.pageScrollX > 4) {
    issues.push(
      `The page scrolls (${m.pageScrollY}px vertically, ${m.pageScrollX}px horizontally) at ${stage}. ` +
        'Everything must fit one screen: tighten spacing, shorten text, use two columns, or shrink the visual.',
    );
  }
  for (const p of m.clippedPanels.filter((panel) => panel.hiddenPx >= MIN_HIDDEN_PX)) {
    issues.push(
      `${p.label} hides ${p.hiddenPx}px of its content behind a scrollbar. Make it fit without scrolling ` +
        '(fewer words, smaller gaps, a second column, or move secondary content into a toggle).',
    );
  }
  for (const o of m.offStage.filter(
    (item) => item.overflowRight >= MIN_OVERFLOW_PX || item.overflowBottom >= MIN_OVERFLOW_PX,
  )) {
    issues.push(
      `${o.label} extends past the stage edge (right +${o.overflowRight}px, bottom +${o.overflowBottom}px).`,
    );
  }
  for (const c of m.lowContrast) {
    issues.push(
      `Text "${c.text}" (${c.px}px) has contrast ${c.ratio}:1 against its background; ` +
        'it needs at least 4.5:1 (3:1 for large text). Darken the text or change the background.',
    );
  }
  for (const t of m.tinyText) {
    issues.push(`Text "${t.text}" is ${t.px}px; nothing on the stage may be smaller than 12px.`);
  }
  if (!CJK.test(context.title) && m.cjkSamples.length > 0) {
    issues.push(
      `The course language is not Chinese/Japanese/Korean, but the page shows: ${m.cjkSamples
        .map((s) => `"${s}"`)
        .join(', ')}. Translate every on-screen string, label, preset name and aria-label.`,
    );
  }
  for (const o of m.overlaps) {
    issues.push(
      `Text "${o.a}" overlaps text "${o.b}". Move, offset or shorten one of them so every label is readable.`,
    );
  }
  if (m.textLength < 20 && !m.hasCanvasOrSvg) {
    issues.push('The page renders almost nothing: it may have failed to load or draw.');
  } else if (m.contentWidthRatio > 0 && m.contentWidthRatio < 0.7) {
    issues.push(
      `The content only spans ${Math.round(m.contentWidthRatio * 100)}% of the stage width, leaving ` +
        'large empty margins. Use the full stage width: widen the main container and enlarge the main visual.',
    );
  }
  for (const e of errors.slice(0, 4)) issues.push(`JavaScript error while running the page: ${e}`);
  return issues;
}

/** Put the canvas probe first in <head> so it runs before any page script. */
function withCanvasProbe(html: string): string {
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.replace(head[0], head[0] + CANVAS_TEXT_PROBE);
  return CANVAS_TEXT_PROBE + html;
}

/** Render one page and report what a teacher would notice. */
export const reviewInteractivePage: InteractiveReviewFn = async (html, context) =>
  withSlot(async (): Promise<InteractiveReview | null> => {
    let browser: Browser;
    try {
      browser = await getBrowser();
    } catch (error) {
      log.warn('Headless Chromium is unavailable; skipping interactive review', error);
      return null;
    }
    const ctx = await browser.newContext({
      viewport: { width: STAGE_WIDTH, height: STAGE_HEIGHT },
      deviceScaleFactor: 1,
    });
    try {
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', ((error: Error) => errors.push(error.message)) as (arg: never) => void);
      page.on('console', ((msg: { type: () => string; text: () => string }) => {
        if (msg.type() === 'error' && !/favicon|Failed to load resource/i.test(msg.text())) {
          errors.push(msg.text().slice(0, 200));
        }
      }) as (arg: never) => void);
      await page
        .setContent(withCanvasProbe(patchHtmlForIframe(html)), {
          waitUntil: 'load',
          timeout: LOAD_TIMEOUT_MS,
        })
        .catch((error: unknown) => log.warn(`"${context.title}" did not finish loading`, error));
      await page.waitForTimeout(SETTLE_MS);
      const m = await page.evaluate(measurePage, { width: STAGE_WIDTH, height: STAGE_HEIGHT });
      const issues = issuesFromMeasurements(m, context, errors);
      log.info(`"${context.title}": ${issues.length} issue(s)`);
      if (issues.length === 0) return { issues, score: 0 };
      const shot = await page.screenshot({ type: 'jpeg', quality: 70 });
      return {
        issues,
        screenshot: `data:image/jpeg;base64,${shot.toString('base64')}`,
        needsRewrite: needsRewrite(m, context, errors),
        blockingIssues: blockingIssuesFrom(issues),
        score: severityScore(issues),
      };
    } finally {
      await ctx.close().catch(() => {});
    }
  });

/**
 * Exported for tests: severity-weighted total, so a repair that fixes an
 * overflow but leaves slightly small text counts as an improvement.
 */
export function severityScore(issues: string[]): number {
  return issues.reduce((sum, issue) => {
    if (/ is \d+(\.\d+)?px; nothing on the stage/.test(issue)) return sum + 1; // tiny text
    if (/ overlaps text /.test(issue)) return sum + 2;
    return sum + 4; // overflow, clipped content, contrast, language, script errors, empty
  }, 0);
}

/**
 * Exported for tests: the issues that are real faults rather than layout taste
 * (wrong language, an empty page, script errors). Pages built without skill
 * guidance are repaired for these only, so they keep the standard upstream look.
 */
export function blockingIssuesFrom(issues: string[]): string[] {
  return issues.filter((issue) =>
    /^The course language is not |^The page renders almost nothing|^JavaScript error while running/.test(
      issue,
    ),
  );
}

/** Exported for tests: problems a CSS patch cannot fix. */
export function needsRewrite(
  m: PageMeasurements,
  context: { title: string },
  errors: string[],
): boolean {
  const wrongLanguage = !CJK.test(context.title) && m.cjkSamples.length > 0;
  const empty = m.textLength < 20 && !m.hasCanvasOrSvg;
  return wrongLanguage || empty || errors.length > 0;
}

// ── Fast repair: a CSS-only patch from a quick model ──────────────────────────

const PATCH_SYSTEM = [
  'You fix layout defects in a generated HTML teaching page by writing CSS ONLY.',
  'The page is shown at exactly 1280×720 and must fit without scrolling.',
  'You get the problems found by an automatic browser check, a screenshot, and the page source.',
  'Return ONE <style> block and nothing else. Rules:',
  '- Target existing ids/classes/elements from the source; use !important where needed to win.',
  '- Prefer: smaller gaps/padding/font sizes in crowded panels, two-column grids for button',
  '  lists, max-height/min-height:0 on flex children, hiding purely decorative notes,',
  '  repositioning overlapping labels, darker text colours for low contrast.',
  '- Never hide controls, readouts or the main visual. Never change colours of the brand band.',
  '- Never make any text smaller than 12px; fit content by reflowing (columns, grids, wrapping)',
  '  and tightening spacing instead.',
  '- Rules must apply unconditionally (no :has(), @media or state-dependent selectors).',
  '- No JavaScript, no HTML, no comments outside the CSS.',
].join('\n');

/** Pull the CSS out of the model reply; null when there is none or it is unsafe. */
export function extractPatchCss(reply: string): string | null {
  const block = reply.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  let css = (block ? block[1] : reply.replace(/^```(?:css)?\s*|```\s*$/g, '')).trim();
  if (!css || /<\/?script|<\/?style|javascript:/i.test(css)) return null;
  if (!/[{}]/.test(css)) return null;
  css = css.replace(/<\/(?=style)/gi, '');
  return css;
}

/** Append the patch as the last stylesheet so it wins the cascade. */
export function applyPatchCss(html: string, css: string): string {
  const tag = `<style id="qa-fix">\n${css}\n</style>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tag}\n</body>`) : html + tag;
}

export const patchInteractivePage: InteractiveRepairFn = async (html, review, context) => {
  const resolved = await resolveModel({ stage: 'interactive-repair' });
  const text = [
    `Page: "${context.title}" (${context.widgetType})`,
    '',
    '## Problems found',
    ...review.issues.map((issue) => `- ${issue}`),
    '',
    '## Page source',
    html,
  ].join('\n');
  const result = await callLLM(
    {
      model: resolved.model,
      system: PATCH_SYSTEM,
      messages: [
        {
          role: 'user',
          content: review.screenshot
            ? [
                { type: 'text', text },
                { type: 'image', image: review.screenshot },
              ]
            : text,
        },
      ],
      maxRetries: 0,
    },
    'interactive-repair',
    undefined,
    resolved.thinkingConfig,
  );
  const css = extractPatchCss(result.text);
  if (!css) {
    log.warn(`"${context.title}": repair model returned no usable CSS`);
    return null;
  }
  log.info(`"${context.title}": applied ${css.length}-char CSS patch`);
  return applyPatchCss(html, css);
};
