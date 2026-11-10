import { afterEach, describe, expect, it } from 'vitest';

import {
  applyPatchCss,
  blockingIssuesFrom,
  extractPatchCss,
  interactiveReviewOption,
  issuesFromMeasurements,
  needsRewrite,
  severityScore,
  type PageMeasurements,
} from '@/lib/server/interactive-qa/review';

const clean: PageMeasurements = {
  pageScrollY: 0,
  pageScrollX: 0,
  clippedPanels: [],
  offStage: [],
  lowContrast: [],
  tinyText: [],
  cjkSamples: [],
  overlaps: [],
  textLength: 500,
  hasCanvasOrSvg: true,
  contentWidthRatio: 0.95,
  contentHeightRatio: 0.9,
};

describe('interactive QA issues (fork)', () => {
  const env = process.env.OPENMAIC_INTERACTIVE_QA;
  afterEach(() => {
    process.env.OPENMAIC_INTERACTIVE_QA = env;
  });

  it('passes a clean page', () => {
    expect(issuesFromMeasurements(clean, { title: 'Sound waves' }, [])).toEqual([]);
  });

  it('reports scroll, clipped panels, contrast, tiny text, width and script errors', () => {
    const issues = issuesFromMeasurements(
      {
        ...clean,
        pageScrollY: 240,
        clippedPanels: [
          { label: 'aside#controls', hiddenPx: 269 },
          { label: 'div#minor', hiddenPx: 14 },
        ],
        lowContrast: [{ text: 'Sound Lab', ratio: 1.1, px: 34 }],
        tinyText: [{ text: 'note', px: 9 }],
        contentWidthRatio: 0.5,
        overlaps: [{ a: 'Rate (bubbles/min)', b: 'CO2 held constant' }],
      },
      { title: 'Sound waves' },
      ['ReferenceError: x is not defined'],
    );
    expect(issues.join('\n')).toMatch(/scrolls \(240px/);
    expect(issues.join('\n')).toMatch(/aside#controls hides 269px/);
    expect(issues.join('\n')).not.toMatch(/div#minor/); // minor leftovers are not worth a repair
    expect(issues.join('\n')).toMatch(/contrast 1\.1:1/);
    expect(issues.join('\n')).toMatch(/9px/);
    expect(issues.join('\n')).toMatch(/50% of the stage width/);
    expect(issues.join('\n')).toMatch(/ReferenceError/);
    expect(issues.join('\n')).toMatch(/"Rate \(bubbles\/min\)" overlaps/);
  });

  it('flags CJK text only when the course title is not CJK', () => {
    const m = { ...clean, cjkSamples: ['启动', '重置'] };
    expect(issuesFromMeasurements(m, { title: 'Sound waves' }, []).join()).toMatch(/启动/);
    expect(issuesFromMeasurements(m, { title: '声音与波' }, [])).toEqual([]);
  });

  it('is off unless OPENMAIC_INTERACTIVE_QA=true', () => {
    delete process.env.OPENMAIC_INTERACTIVE_QA;
    expect(interactiveReviewOption()).toEqual({});
    process.env.OPENMAIC_INTERACTIVE_QA = 'true';
    expect(typeof interactiveReviewOption().reviewInteractive).toBe('function');
  });
});

describe('fast repair helpers (fork)', () => {
  it('only wrong language, script errors or an empty page need a rewrite', () => {
    expect(needsRewrite({ ...clean, pageScrollY: 300 }, { title: 'Sound' }, [])).toBe(false);
    expect(needsRewrite({ ...clean, cjkSamples: ['启动'] }, { title: 'Sound' }, [])).toBe(true);
    expect(needsRewrite(clean, { title: 'Sound' }, ['TypeError'])).toBe(true);
    expect(needsRewrite({ ...clean, textLength: 3, hasCanvasOrSvg: false }, { title: 'x' }, [])).toBe(true);
  });

  it('blocking issues are exactly the faults that need a rewrite, never layout notes', () => {
    const issues = issuesFromMeasurements(
      { ...clean, pageScrollY: 300, tinyText: [{ text: 'a', px: 10 }], cjkSamples: ['启动'] },
      { title: 'Sound' },
      ['TypeError: x is undefined'],
    );
    const blocking = blockingIssuesFrom(issues);
    expect(blocking).toHaveLength(2);
    expect(blocking[0]).toMatch(/^The course language is not /);
    expect(blocking[1]).toMatch(/^JavaScript error while running/);
    const empty = issuesFromMeasurements({ ...clean, textLength: 3, hasCanvasOrSvg: false }, { title: 'x' }, []);
    expect(blockingIssuesFrom(empty)).toHaveLength(1);
    expect(blockingIssuesFrom(issuesFromMeasurements({ ...clean, pageScrollY: 300 }, { title: 'x' }, []))).toEqual([]);
  });

  it('weighs overflow above slightly small text', () => {
    const overflow = ['div#a ("x") extends past the stage edge (right +0px, bottom +40px).'];
    const tiny = ['Text "a" is 10px; nothing on the stage may be smaller than 12px.', 'Text "b" is 10px; nothing on the stage may be smaller than 12px.'];
    expect(severityScore(tiny)).toBeLessThan(severityScore(overflow));
  });

  it('extracts CSS from a style block or a fenced reply and rejects script', () => {
    expect(extractPatchCss('<style>#a{gap:4px}</style>')).toBe('#a{gap:4px}');
    expect(extractPatchCss('```css\n#a{gap:4px}\n```')).toBe('#a{gap:4px}');
    expect(extractPatchCss('<style><script>x</script></style>')).toBeNull();
    expect(extractPatchCss('sorry')).toBeNull();
  });

  it('appends the patch as the last stylesheet in body', () => {
    const out = applyPatchCss('<html><body><p>x</p></body></html>', '#a{gap:4px}');
    expect(out).toMatch(/<style id="qa-fix">\n#a\{gap:4px\}\n<\/style>\n<\/body>/);
  });

  it('offers both review and repair when enabled', () => {
    process.env.OPENMAIC_INTERACTIVE_QA = 'true';
    const opt = interactiveReviewOption();
    expect(typeof opt.repairInteractive).toBe('function');
    delete process.env.OPENMAIC_INTERACTIVE_QA;
  });
});
