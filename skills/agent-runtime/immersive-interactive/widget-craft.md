### Immersive Interactive: studio-quality, fully animated page

Build this page as a showcase: it should feel like a polished interactive feature
from a top science museum or an award-winning education site (PhET, Desmos,
Brilliant), not a form with a chart. Part A sets the depth of interaction; Part B
raises visual and motion quality on top. Every required rule earlier in this prompt
(element IDs, widget config, postMessage listener, single HTML document) still wins.

### Part A: Interaction depth

#### A1. Direct manipulation first

- The signature visual itself is interactive: learners **drag, click or scrub the objects in it**
  (drag the Moon along its orbit, drag a vector tip, drag a point on a graph, drag a card into a
  slot), not only the sliders beside it. Sliders and the visual stay in sync both ways.
- Draggable things look draggable: `cursor: grab` / `grabbing`, a soft halo or handle on hover,
  and a slightly larger hit area than the drawn shape (at least 44px). Support pointer events
  (`pointerdown` / `pointermove` / `pointerup` with `setPointerCapture`) so mouse, pen and touch
  all work; set `touch-action: none` on the drag surface.
- Hovering or focusing a meaningful part of the visual shows a small tooltip with its name and
  live value (a small frosted chip, 13px, follows the pointer, never covers the object itself).

#### A2. Linked representations

- Show the same idea **two ways at once** and keep them linked: the picture plus a live graph,
  number line, table, equation or "view from" inset. Changing one updates the other instantly,
  and a marker on the second view shows where the current state sits (a moving dot on the curve,
  a highlighted table row).
- Equations, when the topic has one, are shown with the current values substituted and updated
  live (e.g. `F = m·a = 2.0 kg × 3.5 m/s² = 7.0 N`). Use KaTeX if the formula needs real maths
  typesetting.

#### A3. Guidance without clutter

- On load, one short coach mark points at the first thing to try ("Drag the Moon" with a gently
  pulsing ring). It disappears after the first interaction and does not come back.
- A one-line status/insight strip reacts to what the learner is doing ("Waxing: the lit side is
  growing"). Update it from the model state, never from a hard-coded sequence.
- Keyboard: arrow keys nudge the focused draggable or slider, Space plays/pauses, R resets.

#### A4. Rendering quality

- Canvas is crisp on every screen: size the backing store by `devicePixelRatio`
  (`canvas.width = cssWidth * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`), redraw on
  `ResizeObserver`.
- Fill the stage: scale the main drawing from its container so it uses most of the space
  (the key object or diagram spans roughly 70–85% of the shorter side of its pane). Large empty
  areas with a small drawing in the middle look unfinished. When there are two views, give each
  its own clear region and size both generously.
- Give objects form: soft radial or linear gradients for spheres and surfaces, a subtle shadow
  under lifted objects, rounded line caps and joins, 2px strokes, labelled axes with units and
  quiet gridlines. Motion trails or faint "ghost" positions help show change over
  time; keep them subtle.
- Animate changes of state instead of jumping: ease values toward their targets
  (`current += (target - current) * 0.15` per frame, or GSAP for UI tweens) so presets, resets
  and teacher actions glide. Physics and time-based simulations use a fixed time step driven by
  `requestAnimationFrame` deltas so speed does not depend on frame rate.
- Numbers that change animate or flip smoothly and use tabular numerals; important thresholds
  get a marker on the scale.
- Do not add decoration that teaches nothing (floating particles, spinning logos, confetti
  storms). Every moving thing should be part of the idea.

#### A5. Language and legibility

- Every piece of on-screen text (titles, buttons, labels, tooltips, status lines, feedback,
  `aria-label`s) is in the course language given by the language directive. Never mix
  languages; code comments may stay in English.
- Labels never overlap each other or the objects they name. Where marks cross or crowd (strands
  of a helix, dense points, nodes), offset, hide or thin the labels and show the full label on
  hover or selection instead.
- When items belong to different categories that matter to the idea (bases A/T/C/G, element
  types, forces), give each category its own consistent colour plus its letter or icon, so the
  pattern is visible at a glance.

#### A6. Correctness is part of quality (CRITICAL)

A beautiful page that teaches something wrong is a failure. Learners trust labels.

- Keep **one model**: a single state object and pure functions that derive everything else from
  it. Every label, name, readout, colour state and feedback message is computed from that model
  by a function (e.g. `phaseName(angle)`, `isStable(forces)`), never typed by hand next to a
  preset or button.
- Use the real relationships and correct conventions of the subject (formulas, units, sign
  conventions, direction of rotation, which side is lit, order of stages). If the topic involves
  named states or categories, write out the mapping carefully (boundaries included) before
  coding it.
- Add a small self-check that runs on load: for every preset and every named state, compute the
  derived label and compare it with the expected name, logging any mismatch with
  `console.warn('[self-check]', …)`. Fix the model until the self-check passes. Example:

```js
var EXPECTED = [
  { state: { angle: 0 },   name: 'New Moon' },
  { state: { angle: 180 }, name: 'Full Moon' },
];
EXPECTED.forEach(function (c) {
  var got = phaseName(c.state.angle);
  if (got !== c.name) console.warn('[self-check]', c, 'got', got);
});
```

- Visuals must agree with labels (if the readout says 82% lit, the picture shows a gibbous, and
  the name says gibbous). Ranges, units and default values must be realistic.

### Part B: Visual and motion quality

#### B1. Decide on 3D first (and say why in a code comment)

Before writing code, decide whether depth genuinely helps the learner understand
this idea. Write the decision as the first comment in the main script, e.g.
`// 3D: yes. Phase depends on the Sun-Earth-Moon angle in space.`

- **Use real-time 3D (Three.js)** when the idea is spatial: solids and
  cross-sections, orbits, molecules and lattices, anatomy, fields and waves in
  space, vectors in 3D, terrain, machines with moving parts. This applies to any
  widget type, not only `visualization3d`.
- **Stay 2D** (Canvas, SVG, D3) when the idea is a graph, a flow, a balance of
  quantities, a sequence or text. A flat idea in 3D is harder to read; make it
  rich with depth, light and motion in 2D instead.

When you use Three.js, load it exactly like this and nothing newer:

```html
<script type="importmap">
{ "imports": {
  "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
  "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
} }
</script>
```

3D quality bar:
- `WebGLRenderer({ antialias: true })`, `setPixelRatio(Math.min(devicePixelRatio, 2))`,
  `outputColorSpace = THREE.SRGBColorSpace`, `toneMapping = THREE.ACESFilmicToneMapping`.
- Lighting with intent: a key light, a soft fill (`HemisphereLight`), and a rim
  light to separate objects from the background. Soft shadows on the object that
  matters (`PCFSoftShadowMap`, one shadow-casting light, small shadow map).
- Physically based materials (`MeshStandardMaterial` / `MeshPhysicalMaterial`)
  with sensible roughness and metalness; procedural textures drawn on a canvas
  (`CanvasTexture`) for surfaces such as planets, terrain or cells. Never load
  external image or model files.
- `OrbitControls` with damping, sensible min/max distance and polar limits so the
  learner can never lose the subject. Add zoom buttons and a "Reset View" button
  that animates the camera back.
- Labels attached to 3D objects are HTML overlays positioned by projecting the
  object's position to the screen each frame (or `CSS2DRenderer`), styled with
  the page's colours, and hidden when the object faces away or is occluded.
- Clicking or tapping an object (via `Raycaster`) highlights it (emissive glow or
  outline) and opens its detail in the side panel.
- Keep it fast: share geometries and materials, keep under about 100 draw calls,
  pause rendering when nothing changes and the tab is hidden, dispose of objects
  you remove. Target a steady 60 fps on a school laptop.
- The 3D canvas background follows the page's colour scheme; a deep, dark
  backdrop is fine for space or microscopic scenes.

#### B2. Cinematic entrance

On load, play a short, skippable entrance (1.2 to 2 seconds) that introduces the
scene in a meaningful order, using a GSAP timeline
(`https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js`):
the backdrop fades in, the main object arrives (the camera glides in, or the
diagram draws itself stroke by stroke), then labels and controls stagger in.
Any click or key skips straight to the end state. Teacher `SET_WIDGET_STATE`
actions never wait for the entrance.

The classroom may load this page in a hidden frame before showing it, where
animation frames are paused. An entrance must therefore never be able to leave
content invisible:
- Start the entrance on the first `requestAnimationFrame` after
  `document.visibilityState === 'visible'`, not on `load`.
- Add a safety timer: `setTimeout(() => entrance.progress(1), 3000)`.
- Never hide controls, labels or readouts with CSS alone (`opacity: 0` in a
  stylesheet); only animate from hidden in JavaScript, so content stays visible
  if the animation library fails to load.

#### B3. Motion as explanation

- Every state change animates with easing so the learner sees *how* it changed:
  values tween, objects travel along their real paths, the camera eases to frame
  what the step is about.
- Processes play as guided sequences: a Play button walks through the stages with
  a progress scrubber the learner can drag back and forth, with the current stage
  named in the status strip. Each stage's camera framing and highlight is
  choreographed.
- Use particles, flows and trails where they show something real (charge moving
  in a wire, gas molecules, light rays, blood flow), and tie their speed and
  density to the model.
- Microinteractions everywhere: hover lift on cards, pressed states, a soft
  pulse on the thing to try next, a brief, tasteful moment when the learner
  gets something right.

#### B4. Art direction

- Treat the page as one composed scene with foreground, subject and background
  layers. The subject is large, lit and in focus; supporting panels are glassy
  overlays (translucent with backdrop blur) floating over the scene, not boxes
  beside it, wherever that keeps the subject big.
- A restrained palette (the page's own colours, or the theme tokens if a design
  skill supplies them) plus at most two scene colours that mean something (e.g. warm = energy, cool = matter). Gradients and
  glows only where they model light.
- Typography stays crisp and sparse: an eyebrow, a title, short labels. No
  paragraphs on screen; the teacher's narration carries the explanation.
- Include a compact HUD with the live key quantities, and a "Focus" toggle that
  hides the panels to show the scene full-frame.

#### B5. Robustness

- If WebGL is unavailable, fall back to a clear 2D version of the same model
  with a one-line note, never a blank page.
- Respect `prefers-reduced-motion`: skip the entrance and use short cross-fades,
  but keep the content animation the learner starts.
- No console errors. The self-check still runs and passes.
- The whole activity is visible at once without scrolling the page.
- Before output, check: the learner can grab something in the main visual; two
  linked views update together; every label comes from the model and the
  self-check passes; all text is in the course language; no labels overlap.
