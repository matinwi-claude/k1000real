# K1000 Interactive

An explorable digital-twin website for the **Kraus Hamdani Aerospace K1000ULE**, a solar-recharged eVTOL UAV that flies for a very long time. The whole site is the aircraft: rotate it, zoom in on tiny parts, explode it, X-ray it and inspect any of its 43 components.

Built with React, TypeScript, Vite and Three.js, and deployed on Cloudflare Workers (static assets + a tiny `/api/status` Worker).

> **About accuracy.** No official CAD is bundled. The 3D model is built in code. Most parts now come from CAD (see below); the rest were traced from CAD views of the K1000ULE (top, 3/4 and exploded views), cross-checked against the manufacturer's public renders. That covers the three-piece solar wing, slim keel fuselage with removable canopy and antenna masts, spindle booms carrying four lift rotors, nose tractor prop, and T-tail. The absolute scale (a 5 m wingspan is assumed) and the internal layout are illustrative. In the inspector, specs tagged **PUBLISHED** come from the public K1000ULE product page. Every other value is a labelled placeholder. To show the real geometry, drop in a model file (see below).

## Run locally

```bash
npm install
npm run dev              # Vite dev server (mocks /api/status)
npm run build            # typecheck + production build → dist/
npm run preview:worker   # build, then run the real Worker + static assets locally (wrangler dev)
```

## Password for the 3D viewer

The 2D parts atlas (`/parts`) is public. The 3D viewer and its model file need a password: the browser shows its own login prompt (any user name, unless `VIEWER_USER` is set). Set the password once as a Worker secret — until it is set, the 3D viewer answers with a "password has not been set" page:

```bash
npx wrangler secret put VIEWER_PASSWORD
```

Run the same command again to change it. If the site is a Cloudflare **Pages** project, `functions/_middleware.ts` applies the same gate: add `VIEWER_PASSWORD` under the project's Settings → Variables and Secrets, as an encrypted (secret) value. Locally, put `VIEWER_PASSWORD=...` in a `.dev.vars` file (git-ignored) for `npm run preview:worker`.

## Deploy to Cloudflare

The site deploys as a **Cloudflare Worker with Static Assets**. Everything is set in `wrangler.toml`:

- `[build]` runs `npm run build` automatically before each deploy.
- `[assets]` uploads `dist/` and serves it as a single-page app.
- The Worker script `worker/index.ts` only handles `/api/*`, e.g. `/api/status`.
- `public/_headers` gives hashed assets a year-long immutable cache and adds security headers.

**Git-connected Workers project** (Workers & Pages → Create → Import a repository):

| Setting | Value |
| --- | --- |
| Build command | *(leave empty — wrangler runs it)* |
| Deploy command | `npx wrangler deploy` |

The Worker name in the dashboard must match `name = "k1000"` in `wrangler.toml`. Change one of them if they differ.

**CLI:** `npx wrangler login` then `npm run deploy`.

## Embed it on another website

```html
<div data-k1000></div>
<script src="https://YOUR-VIEWER-HOST/embed.js" async></script>
```

Use `<div data-k1000="parts"></div>` instead to embed the **2D parts atlas**: an exploded line drawing where every part can be clicked (full page at `/parts`).

The embedded viewer doesn't take over the host page's scrolling, loads lazily, pauses while off-screen, and can be controlled from the host page (`viewer.select('eo-ir')`, `viewer.explode(1)`, …). See **[EMBED.md](EMBED.md)** for options, the API, events and allowed-domain settings, and `/embed-demo.html` for a live example.

**Only your own website can embed it.** Browsers refuse to show the viewer or the parts atlas inside any site not listed in `EMBED_ORIGINS` (`wrangler.toml`, default `https://www.khaero.com https://khaero.com`). To allow another domain (a staging or builder preview domain, for example), add it there, separated by spaces, and redeploy; on a Pages project set `EMBED_ORIGINS` under Settings → Variables and Secrets instead. The embed code itself is only shown inside the password-protected 3D viewer (rail → EMBED).

## Using the real K1000ULE model

Put a glTF binary at **`public/models/k1000ule.glb`**. If it's there, it replaces the generated model automatically. If it's missing, the generated model is used.

- **Coordinate frame:** +Y up, nose toward +Z, units in metres. Files in other units are rescaled to a 5 m span and re-centred.
- **Interactive parts:** name each mesh (or its parent node) after a component id from `src/data/components.ts`, e.g. `wing-port`, `lift-motor-03`, `eo-ir`. Alternatively, set `extras.componentId` on the mesh. Matching parts can then be selected, exploded, hidden and inspected on their own. Meshes that don't match a component are grouped under `fuselage`.
- **CAD files:** convert STEP/IGES to glTF first, e.g. with Blender, CAD Exchanger or FreeCAD.

## Replacing individual parts with CAD (STL)

Single parts can be swapped for real CAD while every other part keeps its generated geometry. The fuselage (with its four antenna masts and skids), canopy hatch, HD40 gimbal camera, cruise motor and propeller, pitot, tail boom with fin, rudder, horizontal stabilizer and elevators already come from the STLs in `models-src/`.

1. Put the STL in `models-src/`.
2. Add it to `models-src/parts.json`:
   - `units`: `mm`, `cm`, `m` or `in`.
   - `axes`: which source axis becomes the viewer's x (port), y (up) and z (nose). For example, `["x", "z", "-y"]` is Z-up with the nose toward −Y.
   - `offset`: metres to shift the part after conversion, so it lines up with the rest of the aircraft.
   - `default`: the component id and material for the whole file.
   - `pieces` (optional): send some of the file's separate bodies to other components. Rules use the source coordinates, e.g. `{ "min_z_gt": -20, "center_x_gt": 40 }`.
3. Run `python3 tools/import-parts.py`. It needs `pip install trimesh scipy networkx rtree fast-simplification` and Node. CAD that arrives as STEP is converted first with `python3 tools/step-to-stl.py in.step out.stl` (needs `pip install cadquery-ocp`). Add `"keep": 0.3` to a source to simplify heavy meshes to that fraction of their triangles. It writes `public/models/parts.glb`, which the viewer loads automatically.
4. Regenerate the 2D drawing (see below) so the parts atlas shows the new geometry.

## 2D parts atlas (`/parts`)

An exploded, isometric line drawing of every part, styled like a technical brochure.
- Click any part to see its description, specs and connected parts. Hover for a tooltip. Hover a label or system filter to highlight an assembly.
- Zoom and pan with the mouse wheel, by dragging, or by pinching. Light theme and brand colours are set with URL parameters (see EMBED.md).
- **The drawing is generated from the 3D model, not drawn by hand.** `tools/lineart.ts` builds the same model, spreads the parts out, renders an isometric depth buffer and keeps only the visible edges. The result is `src/parts/lineart.json` (plus a portrait variant for phones). The page itself loads no Three.js.
- **To change the layout:** edit `tools/layout2d.ts`. Then, with `npm run dev` running, regenerate the drawing with `node tools/run-lineart.mjs` and `node tools/run-lineart.mjs "http://localhost:5173/tools/lineart.html?variant=portrait" src/parts/lineart-portrait.json`. This needs `playwright-core` and a Chromium.

## Features

- **Camera:** smooth damped orbit, pan and zoom. Zoom follows the cursor and goes from the whole aircraft down to millimetre-scale parts. Presets: Reset, Front, Side, Top and Bottom. Inertia and auto-rotate are included. Touch: one finger rotates, two fingers pan, pinch zooms.
- **Inspect:**
  - Hovering shows a tooltip.
  - Clicking dims the rest of the aircraft, outlines the selected part and draws a callout line to the panel.
  - The panel has Overview, Technical, Location (planform locator) and Related tabs.
  - Inspection mode adds corner brackets with coordinates and flies the camera to the selected part.
  - Selecting an internal part ghosts the skin automatically so you can see it.
- **Views:**
  - **Exploded:** animated, staggered separation of the assemblies, controlled with an ASSEMBLY slider. Guide lines connect each part to where it belongs.
  - **X-ray:** fresnel-style see-through rendering.
- **Tools:**
  - Lighting presets: Studio, Sky, Night and Inspection.
- **Shareable URL state:**
  - `?mode=inspection&component=lift-motor-04`
  - `?view=exploded` · `?view=xray`
  - `?light=night&cam=…`
  - Use **Copy link** in settings.
- **Easter eggs:**
  - Click the logo five times to turn on Engineer mode (diagnostics, rotor spin test, wireframe, hidden field notes).
  - Click a part number three times to reveal a note.
  - Look for the tiny serial plate under the starboard boom.
  - Type `k1000` for a cinematic flyaround.

### Keyboard

`1–5` views · `E` explode · `I` inspect · `X` x-ray · `L` lighting · `R` auto-rotate · `F` focus · `H` hide part · `Esc` back

## Performance

- **Lazy loading:** the app shell paints immediately. Three.js and the engine load as a separate code-split chunk.
- **Geometry:** all generated in code, with no image or model assets. Each component's geometry is merged per material, fasteners are instanced, and raycasting is BVH-accelerated (`three-mesh-bvh`).
- **Rendering:** frames render only when something changes. Pixel ratio adapts to frame time, and mobile is capped at 1.5×.

## Project structure

```
src/
  components/   DroneViewer, ComponentInspector, Controls, ExplodedView,
                StatusPanel, IntroOverlay, …
  data/         components.ts (component database), layout.ts (traced proportions)
  engine/       DroneEngine (renderer, camera, interaction, animation), DroneModel (generated model),
                GltfModel (real-model loader), Hud (SVG overlay), materials, lighting, geometry, textures
  shaders/      material patch (highlight / x-ray / ghost / dissolve), floor grid
  hooks/        idle fade, keyboard, URL sync
  utils/        actions, URL state, sound
worker/         index.ts — Cloudflare Worker (/api/status), assets served from dist/
```

K1000ULE is a product of Kraus Hamdani Aerospace. This project is an independent interactive visualization.
