### NIE Design: NIE-branded design system (applies to the whole page)

Build the page so it is recognisably NIE (National Institute of Education, Singapore): confident
and clear, built on the NIE institutional colours — NIE blue `#0047B6`, NIE red `#D81F2A` and NIE
yellow `#FFB300` — with a branded title band, white cards on a cool grey page, precise typography
and soft depth. It should feel like a polished NIE teaching tool, not a plain form.
This section governs **look, layout and libraries**. Every functional rule in this prompt
(required element IDs, widget config, postMessage listener, reset, overlap safety, 3D lighting)
still wins if anything here seems to conflict. The stage-format and theme rules below replace any
mobile-first sizing advice or fixed example colours (`#3498db`, `bg-white`, dark-only palettes …)
that appear earlier in this prompt.

#### Stage format: one 1280×720 screen, no page scroll (CRITICAL)

The page is shown inside a lesson stage as a fixed **1280×720** viewport, scaled to fit the
learner's screen. It is a screen in an app (think a Keynote slide or an iPad app window), **not
a long web page** — the learner must see the whole activity at once without scrolling.

- `html, body { height: 100%; overflow: hidden; }` and build the page as one full-viewport frame.
  The host forces `margin: 0; padding: 0` on `html` and `body`, so put **no** padding/margin/gap
  classes on `<body>`; put them on a single wrapper inside it:

```html
<body>
  <div id="stage" class="h-screen overflow-hidden flex flex-col gap-4 p-6 bg-[var(--bg)] text-[var(--label)]">
    <header class="shrink-0"> … </header>
    <main class="flex-1 min-h-0 flex gap-4"> … </main>
  </div>
</body>
```
- Budget the 720px height: header at most ~90px (optional eyebrow 12–13px + title 28–32px, an
  optional one-line subtitle); the main area fills the rest (`flex-1 min-h-0`); outer padding
  24–32px. No hero section, no long intro paragraph, no footer, no "summary" section below the fold —
  key takeaways belong in a compact callout inside the frame or in the teacher's narration.
- Main area is a two-pane layout: the signature visual (canvas, chart, diagram, board, 3D view)
  takes ~65–75% of the width and the full available height; a control column of ~300–340px holds
  sliders, buttons and readouts. A HUD or readout strip may overlay the visual instead.
- Size canvases/SVGs from their container (`ResizeObserver` or reading `clientWidth/Height`), never
  from fixed tall heights. Nothing may overflow the 720px frame.
- If the control column has more than fits, tighten it first (fewer words, 2-column readouts,
  smaller gaps); only as a last resort let that column scroll internally (`overflow-y-auto`) —
  the page itself never scrolls.
- Keep descriptive text to a line or two per control; no paragraphs of explanation on screen.
- Responsive Tailwind prefixes are fine but optional: the viewport is always 1280×720 (`xl`).

#### Required `<head>` resources (load from CDN, exact versions)

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=block">
```

#### CDN rules

- Prefer a well-known CDN library over hand-written code whenever one fits:
  Chart.js (`https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js`),
  D3 (`https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js`),
  GSAP (`https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js`),
  KaTeX, Three.js, Pyodide, CodeMirror as described elsewhere in this prompt.
- Load only from `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `unpkg.com`, or Google Fonts.
- Always pin an exact version. Never use `@latest`, an unversioned URL, or a major-only tag.
- No build step, no npm imports, no bare-specifier ES module imports without an import map.
- Do not load a library you do not use.

#### Tailwind usage

- Style elements with Tailwind utility classes directly in markup (`flex`, `gap-4`, `rounded-2xl`,
  `text-[17px]`, `md:grid-cols-2` ...). Responsive prefixes are encouraged.
- Do **not** use `@apply`, `@layer`, or `<style type="text/tailwindcss">` blocks.
- Put design tokens and anything Tailwind cannot express (range-slider styling, keyframes,
  `backdrop-filter`, canvas sizing) in one ordinary `<style>` block using the CSS variables below,
  and reference them from utilities with arbitrary values, e.g. `bg-[var(--surface)]`.

#### Colour tokens and light/dark theme (CRITICAL)

The host app sets `<html data-theme="light">` or `<html data-theme="dark">` to match the
learner's theme setting, and may switch it **while the page is open**. Every page must support
both. Copy these tokens exactly and use only them for colour — in CSS, inline styles, SVG and
canvas drawing:

```css
:root {
  --bg: #F3F6FB;          /* page background: cool grey, so white cards stand out */
  --surface: #FFFFFF;     /* cards, panels */
  --surface-2: #E9EFF8;   /* inset wells, list rows, segmented-control track */
  --label: #0E1A2B;       /* primary text */
  --label-2: #4A5A70;     /* secondary text */
  --separator: rgba(14, 26, 43, 0.12);
  --track: #C9D3E3;       /* slider/progress track, chart gridlines */
  --accent: #0047B6;      /* NIE blue: primary buttons, active states, links, series 1 */
  --accent-soft: rgba(0, 71, 182, 0.10);
  --on-accent: #FFFFFF;
  --brand-red: #D81F2A;   /* NIE red: emphasis, highlights, series 2 (NOT errors) */
  --brand-yellow: #FFB300;/* NIE yellow: decorative only (rules, markers); never text on white */
  --hero-bg: #FFFFFF;     /* the title band: white, simple and easy to read */
  --hero-label: #0E1A2B;
  --hero-eyebrow: #0047B6;
  --success: #1E7F3C; --warning: #9A5B00; --danger: #B3261E;
  --glass: rgba(255, 255, 255, 0.78);
  --radius-lg: 18px; --radius-md: 12px;
  --shadow: 0 6px 24px rgba(14, 26, 43, 0.08), 0 1px 2px rgba(14, 26, 43, 0.06);
  color-scheme: light;
}
:root[data-theme="dark"] {
  --bg: #0A1220;
  --surface: #121C2E;
  --surface-2: #1B2840;
  --label: #EEF3FB;
  --label-2: #A9B6C9;
  --separator: rgba(238, 243, 251, 0.14);
  --track: #33425C;
  --accent: #3383FF;      /* NIE blue stepped up for dark; dark text on it */
  --accent-soft: rgba(51, 131, 255, 0.18);
  --on-accent: #08101E;
  --brand-red: #FF5C64;
  --brand-yellow: #FFC233;
  --hero-bg: #121C2E;
  --hero-label: #EEF3FB;
  --hero-eyebrow: #3383FF;
  --success: #4CC27A; --warning: #F2A93B; --danger: #FF6B6B;
  --glass: rgba(18, 28, 46, 0.78);
  --shadow: 0 6px 24px rgba(0, 0, 0, 0.45), 0 1px 2px rgba(0, 0, 0, 0.3);
  color-scheme: dark;
}
body { background: var(--bg); color: var(--label); }
```

- Never hard-code a colour (`#fff`, `black`, `bg-white`, `text-gray-900`, `bg-slate-50` …) for
  anything themed; use `var(--…)`, e.g. `bg-[var(--surface)] text-[var(--label)]`.
- Do not use Tailwind `dark:` variants or `@media (prefers-color-scheme)` — the theme comes only
  from `data-theme`.
- Anything drawn in JS (canvas, Chart.js, D3, SVG built in code) must read colours from the tokens
  at draw time and redraw when the theme changes:

```js
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
window.addEventListener('maic-themechange', function () {
  redraw(); // your own draw/render function; for Chart.js update dataset/axis colours then chart.update()
});
```

- 3D scenes that need a dark backdrop (space, deep sea) may keep a dark scene background in both
  themes, but their panels, text and controls still follow the tokens.
- One colour means one thing. `--accent` (NIE blue) is for interaction and the first data series;
  `--brand-red` is for emphasis and the second data series; `--brand-yellow` is decorative only.
  Status uses `--success` / `--warning` / `--danger`, never the brand red. Never convey meaning
  by colour alone — pair it with an icon or text.
- Use at most three data colours on one visual: `--accent`, `--brand-red`, then `--label-2`.
- No rainbow gradients, neon glows, heavy drop shadows, or thick coloured borders.

#### NIE brand signature (REQUIRED)

- The page header is a **title band** built with exactly this markup and CSS (copy it; change
  only the text). The band is white (a dark surface in dark mode) with a blue, red and yellow
  strip in equal thirds along its bottom edge, INSIDE the band and clipped by its rounded corners.
  Never draw the strip as a separate element below the band.

```html
<header class="nie-band shrink-0">
  <p class="nie-eyebrow">Biology · Secondary 3</p>
  <h1 class="nie-title">Limiting Factors of Photosynthesis</h1>
  <!-- optional: <p class="nie-subtitle">One short line.</p> -->
  <!-- optional header controls (e.g. Focus) go in <div class="nie-band-actions">…</div> -->
</header>
```

```css
.nie-band {
  position: relative; overflow: hidden;            /* clips the strip to the rounded corners */
  border-radius: var(--radius-lg);
  background: var(--hero-bg); color: var(--hero-label); box-shadow: var(--shadow);
  padding: 18px 28px 22px;                         /* bottom padding clears the 6px strip */
}
.nie-band::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 6px;
  background: linear-gradient(to right, var(--accent) 0 33.34%, var(--brand-red) 33.34% 66.67%,
    var(--brand-yellow) 66.67% 100%);
}
.nie-eyebrow { margin: 0 0 4px; font-size: 12.5px; font-weight: 600; letter-spacing: .08em;
               text-transform: uppercase; color: var(--hero-eyebrow); }
.nie-title { margin: 0; font-size: 30px; line-height: 1.15; font-weight: 700;
             letter-spacing: -0.02em; color: var(--hero-label); }
.nie-subtitle { margin: 4px 0 0; font-size: 15px; color: var(--hero-label); opacity: .85; }
.nie-band-actions { position: absolute; top: 50%; right: 24px; transform: translateY(-50%);
                    display: flex; gap: 8px; }
.nie-band-actions button { background: var(--accent-soft); color: var(--accent);
                           border-radius: 999px; }
```

- That strip is the page's one decorative gradient. Do not add other tricolour lines, and do not
  put a border, outline or separate rule under the band.
- The title band counts toward the ~90px header budget; keep it compact.
- Cards are white (`--surface`) on the grey page (`--bg`) with `--shadow`; the main visual's
  card may use a faint `--accent-soft` wash behind the drawing to frame it.

#### Typography

- `font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;`
  with `-webkit-font-smoothing: antialiased`.
- Scale (sized for the 1280×720 stage): page title 28–32px semibold, letter-spacing -0.02em
  (one per page); card title 17–20px semibold; body 15–17px regular; caption 13px (never below
  12px). Line-height 1.4–1.5 for body text.
- Weight and size carry hierarchy, not colour. Avoid thin/light weights for small text.
- Numbers that change (readouts, scores, timers) use `font-variant-numeric: tabular-nums` in the
  same sans-serif font. Wherever this prompt asks for a "monospace font for numbers", satisfy it
  this way — a typewriter monospace face is reserved for code only.

#### Layout and surfaces

- Spacing follows an 8px grid: 16–24px between groups, 12–16px inside them. Restraint comes from
  few elements and clear alignment, not from empty space that pushes content off the stage.
- Group related controls on cards: `rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow)]`,
  padding 16–20px. Separate items inside a card with hairline `--separator` rules, not boxes in boxes.
- Frosted glass (`background: var(--glass); backdrop-filter: saturate(180%) blur(20px);`)
  is only for a floating layer over content — a HUD or control bar on top of a canvas — never for
  ordinary cards.
- One signature element per page (the simulation canvas, the diagram, the game board) gets the
  space and the boldness; everything around it stays quiet.

#### Controls

- Minimum touch target 44×44px. Visible `:focus-visible` ring: `outline: 3px solid var(--accent-soft); outline-offset: 2px`.
- Primary button: pill (`rounded-full`), `--accent` fill, `--on-accent` 15–17px semibold text, height 44px,
  pressed state `active:scale-[0.97]`. Only one primary button per group.
- Secondary button: pill, `--accent-soft` fill, `--accent` text. Destructive: `--danger` text.
- Mode switches use a segmented control (pill track in `--surface-2`, `--surface` sliding thumb with shadow).
- On/off settings use an iOS-style switch (51×31px track, `--accent` when on).
- Range sliders: show the live value beside the label in `--label-2`, tabular numerals, with its
  unit. Style every `input[type="range"]` with **exactly** this CSS (thin track, accent fill up to
  the thumb, white thumb). Do not use `accent-color` and do not omit `appearance: none`
  on the input itself — otherwise the browser draws its native slider on top and the track doubles.

```css
input[type="range"] {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 28px; margin: 0;
  background: transparent; cursor: pointer; touch-action: manipulation;
  --fill: 50%;
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 4px; border-radius: 999px;
  background: linear-gradient(to right, var(--accent) 0 var(--fill), var(--track) var(--fill) 100%);
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 24px; height: 24px; margin-top: -10px; border-radius: 50%;
  background: #FFFFFF; border: none;
  box-shadow: 0 0 0 0.5px rgba(0,0,0,.06), 0 3px 8px rgba(0,0,0,.15), 0 1px 1px rgba(0,0,0,.08);
  transition: transform .15s cubic-bezier(.25,.1,.25,1);
}
input[type="range"]:active::-webkit-slider-thumb { transform: scale(1.1); }
input[type="range"]::-moz-range-track { height: 4px; border-radius: 999px; background: var(--track); }
input[type="range"]::-moz-range-progress { height: 4px; border-radius: 999px; background: var(--accent); }
input[type="range"]::-moz-range-thumb {
  width: 24px; height: 24px; border-radius: 50%; background: #FFFFFF; border: none;
  box-shadow: 0 0 0 0.5px rgba(0,0,0,.06), 0 3px 8px rgba(0,0,0,.15), 0 1px 1px rgba(0,0,0,.08);
}
input[type="range"]:focus-visible { outline: none; }
input[type="range"]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px var(--accent-soft), 0 3px 8px rgba(0,0,0,.15); }
input[type="range"]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 4px var(--accent-soft), 0 3px 8px rgba(0,0,0,.15); }
```

  The accent fill is driven by `--fill`. Include this helper, call it once for every slider on load
  and on its `input` event, **and again whenever code sets a slider's value** (presets, reset,
  teacher `setVariable` actions) — otherwise the fill lags behind the thumb:

```js
function paintRange(el) {
  var min = +el.min || 0, max = +el.max || 100;
  el.style.setProperty('--fill', ((el.value - min) / (max - min)) * 100 + '%');
}
document.querySelectorAll('input[type="range"]').forEach(function (el) {
  paintRange(el);
  el.addEventListener('input', function () { paintRange(el); });
});
```
- Labels read as actions in Title Case on buttons ("Start Simulation", "Reset", "Check Answer");
  an action keeps its name through the flow.

#### Icons (Material Symbols Outlined)

The same icon set as NIE ALEX+ Courses. Use it for every icon; do not use emoji or any other
icon font as UI icons.

- Markup: `<span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>`.
  The text inside is the icon's ligature name (lowercase, underscores). Use only real Material
  Symbols names; an unknown name renders as its literal text.
- Add this CSS once (it matches ALEX+):

```css
.material-symbols-outlined {
  font-family: "Material Symbols Outlined";
  font-weight: normal; font-style: normal; line-height: 1;
  letter-spacing: normal; text-transform: none; white-space: nowrap; direction: ltr;
  display: inline-block; vertical-align: middle;
  font-size: 20px;
  -webkit-font-feature-settings: "liga"; -webkit-font-smoothing: antialiased;
}
```
- Load the font exactly as in the `<head>` above (the plain family, one style). Never request
  the variable axes (`opsz,wght,FILL,GRAD@...`) or use `font-variation-settings`: that file is
  several MB and in the classroom frame it often never finishes, leaving icon names as text.
- Size icons to match adjacent text (18–22px via `font-size`). Show an active/selected state
  with colour or a tinted background, not a filled icon. Colour with `var(--accent)`, or
  `var(--label-2)` for a quieter icon.
- Common mapping: play `play_arrow`, pause `pause`, reset `restart_alt`, next `chevron_right`,
  previous `chevron_left`, hint `lightbulb`, correct `check_circle`, wrong `cancel`, info `info`,
  settings `tune`, expand `open_in_full`, zoom `zoom_in` / `zoom_out`, help `help`, close `close`.
- An icon-only button must carry `aria-label` text.

#### Motion

- UI transitions are brief and soft: 200–350ms, `cubic-bezier(0.25, 0.1, 0.25, 1)`;
  cards fade/slide in 8–12px. No bouncing or spinning decorations.
- Wrap decorative UI motion in `@media (prefers-reduced-motion: no-preference)`. The core
  simulation/game animation is content, not decoration — it must still run.

#### Quality bar

- Text contrast at least 4.5:1 (3:1 for 18px+ or bold). `--label-2` on `--surface` passes; never
  put `--label-2` text on `--surface-2` below 15px.
- The whole activity fits the 1280×720 frame with no page scroll, and reads correctly in both
  `data-theme="light"` and `data-theme="dark"`.
- Before output, remove one accessory element if it adds nothing. The title band, tricolour
  rule and NIE blue accents must be present.
