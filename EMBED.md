# Embedding K1000 Interactive

Put the K1000ULE viewer on any website with one line of HTML. It works with any site builder that allows custom HTML: WordPress, Webflow, Squarespace, Wix, Shopify, plain HTML, React and so on.

## Quick start

```html
<div data-k1000></div>
<script src="https://YOUR-VIEWER-HOST/embed.js" async></script>
```

Replace `YOUR-VIEWER-HOST` with the domain the viewer is deployed on, e.g. `k1000.example.workers.dev`. The placeholder becomes a responsive 16:9 viewer.

You can also use the custom element:

```html
<k1000-viewer data-height="560" data-component="lift-motor-03"></k1000-viewer>
<script src="https://YOUR-VIEWER-HOST/embed.js" async></script>
```

Or embed a plain iframe, with no script:

```html
<iframe src="https://YOUR-VIEWER-HOST/?embed=1" title="K1000ULE 3D viewer"
        style="width:100%;aspect-ratio:16/9;border:0" allow="fullscreen" loading="lazy"></iframe>
```

## Options

Set these as attributes on the placeholder. Each one maps to a URL parameter on the iframe.

| Attribute | Values | Effect |
| --- | --- | --- |
| `data-height` | number (px) | Fixed height. If omitted, the viewer keeps an aspect ratio. |
| `data-aspect` | e.g. `21/9` | Aspect ratio used when no height is set. Default `16/9`. |
| `data-radius` | number (px) | Corner radius. Default `12`. |
| `data-component` | component id | Opens with that part selected, e.g. `battery`, `wing-port`, `lift-motor-03`. |
| `data-view` | `exploded`, `internal`, `xray` | Starting view. Combine with commas. |
| `data-light` | `studio`, `technical`, `night`, `inspection` | Lighting preset. |
| `data-mode` | `inspection`, `measure` | Starting tool. |
| `data-overlay` | `1` | Shows the technical overlay. |
| `data-autorotate` | `0` / `1` | Turns the idle rotation off or on. |

The full list of component ids is in `src/data/components.ts`. The viewer also sends it in the `ready` event (see below).

## 2D parts atlas

A flat, exploded line drawing of the K1000ULE with every part laid out. Visitors click a part to see its details. It has no WebGL, loads fast, works on any device, and switches to a portrait layout on phones.

```html
<div data-k1000="parts"></div>
<script src="https://YOUR-VIEWER-HOST/embed.js" async></script>
```

You can also use `<k1000-parts></k1000-parts>`, or an iframe pointing at `https://YOUR-VIEWER-HOST/parts?embed=1`. The full-page version lives at `/parts`.

| Attribute | Values | Effect |
| --- | --- | --- |
| `data-height`, `data-aspect`, `data-radius` | as above | Size. The default aspect ratio is `16/10`. |
| `data-component` | component id | Opens with that part selected. |
| `data-category` | `airframe`, `propulsion`, `power`, `avionics`, `sensors`, `camera`, `payload`, `landing-gear` | Highlights one system. |
| `data-theme` | `light` | Dark lines on a light background, for light pages. |
| `data-accent` | hex without `#`, e.g. `e5322d` | Highlight colour, to match your brand. |
| `data-ink` | hex without `#` | Line colour. |
| `data-labels` | `0` | Hides the drawing labels. |

The atlas understands the `select` and `reset` commands below, plus `viewer.category('power')` (or `send('category', id)`), and it sends the same `ready` and `select` events.

## Controlling the viewer from your page

```js
const viewer = K1000.get(document.querySelector('[data-k1000]'));

viewer.select('battery');        // fly to and inspect a component (null clears)
viewer.view('top');              // reset | front | side | top | bottom
viewer.explode(1);               // 0 = assembled … 1 = fully exploded
viewer.send('xray', true);       // x-ray on/off
viewer.send('internal', true);   // ghost the skin
viewer.send('section', 'side');  // top | side | front | null
viewer.send('lighting', 'night');
viewer.send('overlay', true);
viewer.send('mode', 'inspect');  // explore | inspect | measure
viewer.send('autoRotate', false);
viewer.reset();                  // back to the default state
```

Commands sent before the viewer has loaded are queued and applied once it's ready.

### Events

```js
viewer.on('ready',  (e) => console.log(e.components));    // list of component ids
viewer.on('select', (e) => console.log(e.id, e.name));    // user or API selection
viewer.on('state',  (e) => console.log(e.explode, e.view, e.mode, e.lighting));

// The same events bubble as DOM events on the placeholder:
el.addEventListener('k1000:select', (e) => console.log(e.detail));
```

If you use a plain iframe without `embed.js`, use `postMessage` directly:

```js
iframe.contentWindow.postMessage({ k1000: 'select', value: 'battery' }, 'https://YOUR-VIEWER-HOST');
window.addEventListener('message', (e) => { if (e.data?.k1000 === 'select') console.log(e.data); });
```

## Behaviour inside a host page

- **Scrolling is never hijacked.** Mouse-wheel zoom turns on only after the visitor clicks the model; before that, the wheel scrolls your page and a short hint appears. On phones and tablets, the page keeps scrolling until the visitor taps "Tap to explore".
- **Loading is lazy.** `embed.js` creates the iframe only when the placeholder is within about 300 px of the viewport. Three.js and the engine are code-split, so the first paint is light.
- **Rendering pauses off-screen.** The viewer stops drawing frames while it's scrolled out of view or the tab is hidden, and draws only when something changes. Resolution adapts to the device's speed.
- **It's resilient.** If the GPU resets (WebGL context loss), the viewer shows a notice and reloads itself. If WebGL isn't available at all, it shows a clear message instead of a blank box.
- **It respects reduced motion.** Visitors with "reduce motion" turned on get no idle rotation or floating animation.
- **There are two buttons in the corner:** fullscreen, and "open the full experience in a new tab".
- **It doesn't touch your page's URL.** An embedded viewer never rewrites the host page's URL or history.

## Security and allowed sites

The viewer sends `Content-Security-Policy: frame-ancestors *`, so any site can embed it. To restrict this to specific domains, edit `public/_headers`:

```
/*
  Content-Security-Policy: frame-ancestors 'self' https://www.example.com https://*.example.com
```

The viewer is read-only. Its commands only change the view, so it accepts them from any origin. Its events contain no personal data.

## Live demo

Open `/embed-demo.html` on the viewer host to see an embedded viewer driven by buttons on a regular page.
