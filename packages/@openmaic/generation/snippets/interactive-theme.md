## Light and Dark Theme (CRITICAL)

The host app sets `<html data-theme="light">` or `<html data-theme="dark">` to match the
learner's theme setting, and may switch it **while the page is open**. The page must look right
in both. Choose whatever palette suits the topic, but define it as CSS variables in two sets and
use only those variables for colour (CSS, inline styles, SVG and canvas drawing):

```css
:root {
  /* light theme: your palette */
  --bg: ...; --surface: ...; --text: ...; --text-muted: ...; --border: ...; --accent: ...;
  color-scheme: light;
}
:root[data-theme="dark"] {
  /* dark theme: the same roles, re-tuned for a dark background */
  --bg: ...; --surface: ...; --text: ...; --text-muted: ...; --border: ...; --accent: ...;
  color-scheme: dark;
}
body { background: var(--bg); color: var(--text); }
```

- Add any further roles you need (e.g. `--series-1`, `--success`), always defined in both sets.
- Keep text readable in both themes: at least 4.5:1 contrast for body text.
- Do not hard-code colours for anything themed (`#fff`, `black`, `bg-white`, `text-gray-900` …);
  use `var(--…)`, e.g. `bg-[var(--surface)] text-[var(--text)]` with Tailwind.
- Do not use Tailwind `dark:` variants or `@media (prefers-color-scheme)`: the theme comes only
  from `data-theme`.
- Where the instructions below name fixed colours (for example a dark background), treat them as
  the dark-theme values and choose a matching light-theme value. A scene that is dark by nature
  (outer space, night sky) may keep a dark canvas in both themes, but its panels, labels and
  controls still follow the theme.
- Anything drawn in JS (canvas, Chart.js, D3, SVG built in code) must read colours from the
  variables at draw time and redraw when the theme changes:

```js
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
window.addEventListener('maic-themechange', function () {
  redraw(); // your own draw/render function
});
```
