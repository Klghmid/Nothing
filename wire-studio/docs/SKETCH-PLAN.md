# WireSketch in Wire Studio — plan

**Status: plan, waiting for approval. Nothing below is built yet.**
Backup of the current tool before this work: commit `cc4ca6e` on `Comfyui_wire_UI` and
`wire-studio-backup-2026-10-02.zip` (the whole repository, all documents).

## Goal

Add a **Photoshop-style drawing and editing workspace ("Sketch")** to Wire Studio, next to the
existing ComfyUI workspace ("AI"). It works with a mouse on desktop, with **pen pressure** on drawing
tablets (Wacom, XP-Pen, Huion…) and with **Apple Pencil on iPad**, in the browser, with no install.

Wire Studio stays first a ComfyUI tool. The two workspaces are **separate**: their own screens, code,
data and settings. They meet only through two explicit actions: **Send to AI** and **Open in Sketch**.

The look stays the current Wire Studio design (same top bar, tokens, panels, dark / light themes,
accent colours). AIWIRESKETCH (the iPad app, uploaded 2026-10-02) is the **reference** for tools,
behaviour and lessons learned; it is not ported line by line (it is Swift + PencilKit; this is web).

## Principles

1. **Two workspaces, one switch.** `AI | Sketch` in the top bar. Switching keeps each side exactly
   where it was (open sketch, zoom, tool / family, task, form). Nothing from one side shows in the other.
2. **The pen is the primary input.** Pressure, tilt, hover and full sample rate wherever the browser
   gives them; fingers pan and zoom; the pen wins over a resting palm.
3. **Never lose a stroke.** Every stroke is one undo step, is saved to the device at once and to the
   server shortly after, and survives a refresh, a closed tab or an iPad Safari tab reload.
4. **Only what works.** Tools arrive in phases; a tool that ships is complete, tested and has help text.
   No placeholder buttons.
5. **Same rules as the AI side.** No build step, no framework, no `npm install` for users; small ES
   modules; atomic storage; a test for every behaviour.

## What we take from AIWIRESKETCH (and what we don't)

| Take | Why |
|---|---|
| The tool set and its sections (62 tools in 9 Photoshop sections: Move & Select, Crop & Measure, Retouch, Paint, Erase, Blur & Tone, Pen & Type, Shapes, Navigate) and Photoshop keyboard shortcuts | Proven layout people already know |
| The **pressure curve**: sensitivity (firm ↔ soft, exponent `0.5 × 4^−s`), lightest touch (0–0.5), full-pressure point (0.3–1), live graph, test pad | Checked by you on the iPad; same feel on every device |
| The **raster brush model** (Procreate-style): tip, roundness, angle, rotation (fixed / follow stroke / pen angle), scatter, count, grain (texturized / moving), spacing, StreamLine, taper, min / max size, flow, max opacity, size / opacity jitter, pressure → size / opacity, tilt → size / opacity, airbrush build-up | One brush engine for every brush, importable later |
| The **brush sets** (Sketching, Inking, Drawing, Painting, Airbrushing, Charcoals, Textures, Calligraphy, Spray Paints) and graphite pencils 2H–6B | Starting library |
| The **layer model**: kinds (raster, generated, mask, reference, adjustment, fill, text, shape), 27 blend modes, opacity / fill, locks, masks, clipping | Photoshop parity |
| Masks are **white = selected / visible / regenerate** | Same convention as ComfyUI and the AI side |
| The lessons in its audit (see *Lessons*) | Each one came from a real bug |

| Leave | Why |
|---|---|
| PencilKit vector ink ("Classic" brushes) | Not available on the web; every brush is a raster brush here |
| AI Studio inside the editor | You want AI and Sketch separate; the AI workspace already does every task better |
| Multi-page sketchbooks, iCloud | Phase 4 at the earliest; the server is the sync point instead |

## Layout (keeping the current design)

**Desktop**

```
┌ ≋ Wire Studio  [ AI | Sketch ]  File Edit Image Layer Select Filter View      ⟲ ⟳  ☁ Saved  ⚙ ┐
├ options bar ─ Brush ▾ Soft Round · Size 24 · Opacity 100% · Flow 100% · StreamLine 20% · ⓘ ─────┤
│ ▣ │                                                                       │ Layers │ Brushes │
│ ⬚ │                                                                       │ Color  │ History │
│ ✎ │                     canvas  (zoom · pan · rotate)                     │  ▤ Layer 3  ◉ 100% │
│ ⌫ │                                                                       │  ▤ Layer 2  ◉  80% │
│ ⊘ │                                                                       │  ▤ Background      │
│ … │                                                                       │                    │
├───┴── 2048 × 2048 · 66% · x 812 y 140 · pen 0.62 ∠ 38° ───────────────────┴────────────────────┤
```

- **Tool rail** (left): the Photoshop sections; related tools share a slot (long-press / right-click
  opens the group, as in Photoshop's fly-outs). Same styling as the AI task list.
- **Options bar**: the current tool's options only.
- **Panels** (right): Layers, Brushes, Color, History, Properties; same card style as the AI form panel.
- **Status bar**: size, zoom, cursor position, live pen pressure and tilt.

**iPad (landscape and portrait)**

```
┌ [ AI | Sketch ]  Untitled 3   ⟲ ⟳   ▤ Layers  ✎ Brushes  ● Color  ⋯ ┐
│ ▣ │ ▮ size                                              ┌──────────┐ │
│ ⬚ │ ▮ opacity            canvas                         │ drawer   │ │
│ ✎ │ ⟲ ⟳                                                 │ (Layers) │ │
│ … │ ⇧ ⌥  ← on-screen modifiers                          └──────────┘ │
└───┴───────────────────────────────────────────────────────────────────┘
```

- 44 px touch targets; panels slide over the canvas as drawers instead of taking a column.
- Size and opacity as vertical sliders on the canvas edge (as in the reference app and Procreate).
- On-screen **Shift / Alt** buttons for constrain, subtract, from-centre (no keyboard needed); a
  hardware keyboard gets the full Photoshop shortcuts.
- Add to Home Screen opens it full screen without Safari's bars.

Phones can open the gallery and view sketches; drawing on a phone is not a target.

## Pen input and pressure

One input layer (`sketch/input/`) turns browser events into tool samples
`{x, y, pressure, tiltX, tiltY, azimuth, altitude, time, pointerType}` in canvas pixels.

- **Pointer Events** on the canvas with `touch-action: none` and pointer capture.
- **Full sample rate:** `getCoalescedEvents()` where the browser has it (pens report 120–240 Hz while
  frames are 60–120 Hz); otherwise single events, with dab spacing filling the gaps.
- **Lower latency:** `getPredictedEvents()` for the live preview only (never committed), and a
  `desynchronized` canvas context where supported.
- **Pressure:** pen → `pressure` through your pressure curve; mouse → full pressure (or optional
  speed-based pressure); finger → full pressure when finger drawing is on.
- **Tilt and angle:** `tiltX` / `tiltY` or `altitudeAngle` / `azimuthAngle` → tilt dynamics and
  "Pen angle" brush rotation.
- **Hover:** pens that hover (Wacom, Apple Pencil on hover-capable iPads) show the brush outline
  before touching.
- **Eraser end and barrel button** (Wacom and similar): the eraser end switches to the Eraser while
  it is used; the barrel button is assignable (Eyedropper by default).
- **Palm rejection:** while a pen is down or recently used, touches don't draw; in *Pen only* mode
  (default on touch devices) fingers never draw.
- **Gestures:** two fingers pinch, pan and rotate the view; two-finger tap = undo, three-finger tap =
  redo (as in the reference app). Desktop: Space + drag pans, wheel scrolls, Ctrl / ⌘ + wheel zooms,
  R + drag rotates.
- **iPad Safari specifics:** non-passive `touchstart` / `touchmove` handlers on the canvas stop page
  scroll, double-tap zoom, the magnifier, text selection and Scribble; `gesturestart` is cancelled so
  pinch zooms the canvas, not the page; `-webkit-user-select: none` and `-webkit-touch-callout: none`
  on the workspace.
- Apple Pencil **double-tap and squeeze are not available to web pages**; a Brush ↔ Eraser button on
  the canvas edge replaces them.

**Settings ▸ Pen** (stored **per device** in that browser, because every pen and tablet differs):
pressure curve (sensitivity, lightest touch, full pressure at) with the live graph and a test pad,
Pen only / finger drawing, mouse pressure mode, eraser-end and barrel-button actions.

**Pen lab** (part of Settings ▸ Pen) shows live pressure, tilt, angle, hover, pointer type and the
real sample rate, so each device can be checked in a minute.

What we expect per platform. The Pen lab confirms each row on real devices in Phase 1:

| Device | Browsers | Pressure | Tilt / angle | Hover | Eraser end |
|---|---|---|---|---|---|
| Windows + Wacom / XP-Pen / Huion | Chrome, Edge, Firefox | yes (with Windows Ink on in the driver) | yes | yes | yes |
| macOS + Wacom / XP-Pen / Huion | Chrome, Edge, Safari, Firefox | yes | yes in most | yes | yes |
| iPad + Apple Pencil | Safari (every iPad browser uses WebKit) | yes | yes | Pencil-hover iPads | no (use the button) |
| Android tablet + stylus | Chrome | yes | device-dependent | device-dependent | device-dependent |
| Mouse / trackpad | all | none (full, or by speed) | — | cursor | — |

## Engine

**Document:** id, title, width × height, ppi, background, layers (bottom → top), active layer,
selection, guides, revision. Sizes 16–8192 px; the New dialog has screen, print and **AI-native**
presets (1024², 832 × 1216, 1216 × 832, …, matching the AI families).

**Layers** are raster, stored as **256 px tiles** (only tiles with content exist): a mostly empty
layer costs almost nothing, and undo and saving work per tile. Kinds: raster, generated (from AI),
reference (tracing, never exported), mask, then text / shape (Phase 2) and adjustment / fill
(Phase 3). Properties: name, visible, opacity, blend mode, locks (transparency, pixels, position,
all), mask, clipped, colour label.

**Compositing:** Canvas 2D in Phases 1–2 (it does Normal, Multiply, Screen, Overlay, Darken, Lighten,
Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation, Color,
Luminosity and Linear Dodge natively). A **WebGL2 compositor** in Phase 3 adds the other modes
(Dissolve, Linear Burn, Darker / Lighter Color, Vivid / Linear / Pin Light, Hard Mix, Subtract,
Divide) and keeps large documents fast. Inactive layers above and below the active one are cached as
two composites, so a stroke redraws three images, not every layer.

**Brush engine** (`sketch/engine/brush.js`): samples → StreamLine smoothing → dabs every
`spacing × diameter` (never more than ¼ brush for retouch tools) → per-dab size, opacity, angle,
scatter and jitter from pressure and tilt → stamped into a **stroke buffer**. The buffer is shown
live and merged into the layer's tiles on pen-up as one undo step (within the selection and the
alpha lock). Two stamping back-ends behind one interface: Canvas 2D (Phase 1) and WebGL2 with
16-bit coverage (Phase 3; the reference app found 8-bit coverage bands soft airbrushes).

**Selections:** a coverage mask plus its outline (marching ants); add / subtract / intersect,
feather, expand / contract, invert. Painting, fills, filters and Send to AI respect it.

**History:** before / after copies of the touched tiles only, with a memory budget (about 300 MB on
desktop, 120 MB on iPad, never fewer than 20 steps). Deselect and layer changes are undoable steps.

**Heavy work** (flood fill, filters, image size, PNG encoding, thumbnails) runs in Web Workers with
`OffscreenCanvas`, so the pen never waits for it.

**Memory budget per device:** the New dialog shows how many layers fit at the chosen size on this
device ("4096 × 4096: about 30 layers on this iPad"). iPad Safari limits canvas memory and reloads
tabs that use too much, so the iPad default maximum is 4096 × 4096 (larger by tiles, with a warning).

## Storage and saving

- **On the server** (the source of truth, shared by every device):
  `data/sketches/<id>/sketch.json` (document and layer properties, atomic write + `.bak`, like the
  existing stores), `tiles/<layer>/<x>_<y>.png` and `thumb.webp`. Only tiles that changed are
  written. The gallery reads summaries and thumbnails only, never full documents.
- **On the device:** every committed stroke goes into an **IndexedDB journal** at once; the journal is
  sent to the server about a second later (one upload in flight, the latest pending). After a crash,
  tab reload or lost connection, unsent strokes are replayed. Status in the top bar:
  *Saved* · *Saving…* · *Offline — kept on this device*.
- **Two devices, one sketch:** each save carries the revision it started from; if the server has a
  newer one, you choose *Keep mine*, *Keep theirs* or *Keep both*.
- **Files:** export PNG / JPEG / WebP (whole image, selection, or each layer); `.wiresketch` (a zip of
  the sketch, for backup or moving between computers). Later: **PSD** export / import with layers
  (Phase 4) and **`.aiwire` import** from the iPad app (raster layers and masks; its ink layers are
  PencilKit data the web can't read, unless the iPad app also saves a PNG of each ink layer).

## AI ↔ Sketch: separate, with two bridges

- **Send to AI ▸** (Sketch menu bar, and the selection bar): *Image to Image*, *Inpaint* (the
  selection becomes the mask), *Outpaint*, *ControlNet* (as line art, depth or pose map), *Smart Edit*
  (Krea 2), *Upscale*. It uses the flattened image or the active layer, uploads it, opens that AI task
  with the image (and mask) filled in, and switches to AI. The sketch is not changed.
- **Open in Sketch ▸** (on every AI result, next to *Use as input*): *New sketch* or *As a layer in
  "<last sketch>"*. The layer is a *generated* layer named after family, task and seed. An inpaint
  result sent back to the sketch it came from lands exactly over the original selection.
- There are no AI controls inside Sketch and no drawing tools inside AI.

## Using it from an iPad

Wire Studio runs on the computer next to ComfyUI; the iPad opens it in Safari.

- Today the server listens on `127.0.0.1` only and has no login. For tablets: `HOST=0.0.0.0` (or the
  Tailscale address) turns on an **access key**: created on first start, printed in the terminal as a
  link (`http://<address>:5180/?key=…`) that signs that browser in. Requests without it are refused
  when they don't come from the computer itself.
- Recommended over Tailscale: `tailscale serve --bg 5180` gives `https://<computer>.<tailnet>.ts.net`
  (HTTPS also allows clipboard images, Add to Home Screen as an app and offline caching).
- The iPad never talks to ComfyUI directly; the Wire Studio server does.

## Code layout

```
wire-studio/
  public/
    index.html            the shell: top bar with the AI | Sketch switch
    js/                   AI workspace (unchanged) + shell.js (switch, routes #ai / #sketch)
    sketch/               Sketch workspace, loaded only when first opened
      main.js  doc.js  history.js  store.js  journal.js
      input/     pointer.js  pressure.js  gestures.js  keys.js
      engine/    brush.js  stamp-2d.js  stamp-gl.js  tiles.js  composite.js  blend.js
                 selection.js  fill.js  transform.js
      tools/     registry.js  move.js  marquee.js  lasso.js  brush.js  eraser.js  eyedropper.js …
      ui/        rail.js  options.js  layers.js  brushes.js  color.js  history.js  menus.js
                 gallery.js  new-sketch.js  pen-settings.js
      workers/   fill.js  filters.js  encode.js
    css/app.css (shared tokens)  css/sketch.css (Sketch only)
  lib/sketches.mjs        sketch storage: atomic files, tiles, summaries, thumbnails, revisions
  server.mjs              /api/sketches…, access key when listening beyond this computer
  tests/                  sketch-*.test.mjs (engine, store) · ui-sketch.mjs (browser, pen input)
  docs/SKETCH.md          user guide, tool reference (written as tools ship)
```

Each tool is one file with the same shape (`id`, section, key, cursor, options, `down / move / up`,
help text), registered in `tools/registry.js`; adding a tool never touches the others. Engine code is
plain functions so Node tests can run it without a browser.

## Tools by phase

| Section | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| Move & Select | Move, Rectangular / Elliptical Marquee, Lasso | Polygonal Lasso, Magic Wand, Quick Selection, Selection Brush, Free Transform (also on a selection) | Magnetic Lasso | Object / Subject selection (via ComfyUI when connected) |
| Crop & Measure | Eyedropper | Crop, Canvas Size, Image Size, Rotate / Flip | Perspective Crop, Ruler, Color Sampler | Note, Count |
| Paint | Brush (starter brushes), Paint Bucket | Gradient, Brush Library + Brush Studio, Pencils 2H–6B, Paint Mask | Mixer Brush, Color Replacement, History Brush | Procreate `.brushset` / Photoshop `.abr` import |
| Erase | Eraser | Magic Eraser | Background Eraser | |
| Retouch | | | Clone Stamp, Spot Healing, Healing, Patch | Content-Aware Move, Red Eye, Pattern Stamp |
| Blur & Tone | | | Blur, Sharpen, Smudge, Dodge, Burn, Sponge | |
| Pen & Type | | Horizontal Type | Vertical Type, Type Mask | Pen, Freeform / Curvature Pen, anchor tools, Path Selection |
| Shapes | | Rectangle, Ellipse, Polygon, Star, Line | Custom shapes | |
| Navigate | Hand, Zoom, Rotate View | | | |
| Layers | add, delete, duplicate, reorder, rename, visibility, opacity, blend (native modes), lock, merge down, flatten, reference layer | masks, clipping, groups, link | all 27 blend modes, adjustment / fill layers, layer styles | smart objects |
| Image / Filter | | Image ▸ Adjustments: Brightness / Contrast, Hue / Saturation, Levels, Invert, Desaturate | Curves, Color Balance, Exposure, Vibrance, B&W, Posterize, Threshold; filters: Gaussian / Motion Blur, Sharpen, Noise, Pixelate, Emboss… | Liquify, Blur Gallery, Distort set |
| Files | New (presets), gallery, autosave, PNG / JPEG export, Send to AI / Open in Sketch | Import image as sketch / as layer, copy / paste (incl. from other apps), `.wiresketch` | History panel, symmetry and perspective guides | PSD export / import, `.aiwire` import, offline app |

## Phases

Each phase is usable on its own, keeps every AI test green, adds its tests and documents, and ends
with a new zip.

| Phase | Delivers | Done when |
|---|---|---|
| **0** | Backup, this plan | ✅ backup made; plan approved by you |
| **1 · Draw** | The `AI \| Sketch` switch (AI unchanged); Sketch gallery and New dialog; canvas zoom / pan / rotate; the pen pipeline (pressure, tilt, coalesced samples, palm rejection, gestures, iPad Safari handling); Settings ▸ Pen with the pressure curve and Pen lab; Brush (6 starter brushes), Eraser, Eyedropper, Paint Bucket, colour picker; layers (Phase 1 column); undo / redo; autosave + device journal; PNG / JPEG export; Send to AI and Open in Sketch; core shortcuts; the iPad layout; access key for tablets | You draw with pressure on your iPad and a desktop tablet; 200 strokes in a row with none lost; closing the tab mid-drawing and reopening keeps everything; AI tests unchanged and green |
| **2 · Select & shape** | Phase 2 column: selections, masks, clipping, Free Transform (including a selection, which the iPad app can't do yet), crop and canvas / image size, gradient, text, shapes, Brush Library + Brush Studio, pencils, first adjustments, import / paste | Each tool has help text and a browser test; an iPad session uses every new tool without a keyboard |
| **3 · Retouch & GPU** | WebGL2 compositor and brush stamping (all 27 blend modes, 16-bit soft brushes), retouch and tone brushes, adjustment layers, filters, History panel, symmetry / perspective guides | 4096 × 4096 with 30 layers stays smooth on your iPad; a soft airbrush shows no banding |
| **4 · Pro & files** | Pen tools and paths, layer styles, PSD export / import, `.aiwire` import, brush file import, Liquify, offline home-screen app | Round trip with Photoshop keeps layers, opacity and blend modes |

## Testing

- **Node unit tests** (fast, run by `npm test` with the AI tests): pressure curve (standard is √,
  floor and full-pressure point hold, bad stored values are clamped), StreamLine, dab spacing, blend
  formulas against reference values, flood fill (tolerance, contiguous), selection operations, tile
  history and its memory budget, sketch storage (atomic writes, `.bak` recovery, revision conflicts).
- **Browser tests** (Playwright Chromium, run by `npm run test:ui`): real pen input through DevTools
  (`pointerType: "pen"` with pressure and tilt): harder pressure gives wider lines (measured in
  pixels), every coalesced sample is used, a touch during a pen stroke doesn't draw, two-finger
  pan / zoom, undo / redo, reload restores the sketch, iPad-size touch layouts (1180 × 820, 820 × 1180)
  without horizontal scroll, no page errors, and the AI checks unchanged.
- **On your devices:** the Pen lab on the iPad and on a desktop tablet, then a short checklist per
  phase.
- **Speed budgets** (checked in tests where measurable): pen to pixels within one frame for brushes up
  to 200 px at 4096 × 4096 on an iPad Pro; stroke commit under 50 ms; undo under 100 ms; a 20-layer
  4096 × 4096 sketch opens in under 2 s.

## Lessons from AIWIRESKETCH that this plan builds in

| Lesson (from its audit and roadmap) | Here |
|---|---|
| Per-touch state in the UI's reactive state re-rendered the whole editor per Pencil sample | Pen samples never touch UI state; the canvas redraws once per animation frame |
| A canvas-size image kept for every layer exhausted iPad memory (268 MB per layer at 8192²) | Tiles; empty areas cost nothing; a per-device layer budget in the New dialog |
| Autosave rewrote every image (1 GB a day of writes) | Only changed tiles are written |
| 8-bit stroke coverage banded soft airbrushes | 16-bit coverage in the GPU stamper (Phase 3) |
| Fast strokes left gaps ("green spots") | Every coalesced sample, dabs at most ¼ brush apart |
| Undone ink came back on the next stroke | History restores tiles, and the live stroke buffer is cleared on every undo / redo |
| A stroke was once lost at the end of a burst | Commits queue, never drop; the journal holds every stroke until the server confirms it |
| Free Transform ignored the selection | Free Transform on a selection is in Phase 2 |
| The gallery held every sketch in memory | The gallery reads summaries and thumbnails only |
| Stored settings could hold NaN or huge numbers | Every stored number is clamped on load |

## Risks

| Risk | Plan |
|---|---|
| iPad Safari memory limits and tab reloads | Tiles, per-device budgets, the device journal; test on your iPad Pro 11" (A12Z, 6 GB), the slowest target |
| Pens behave differently per browser and driver | The Pen lab first in Phase 1; every feature degrades to plain pressure, then to no pressure |
| No Apple Pencil double-tap / squeeze on the web | An on-canvas Brush ↔ Eraser button |
| The tool count (62 in the reference) | Phased; one file, one help text and one test per tool |
| Sketch work breaking the AI side | Separate folders, lazy loading, and the full AI test suite on every change |
| Opening the server to the network | Off by default; the access key whenever it listens beyond this computer; HTTPS through Tailscale recommended |

## Decisions for you

1. **Name and switch:** top-bar switch `AI | Sketch`; the section is called *WireSketch* in the docs.
   *(Recommended.)*
2. **iPad access:** run Wire Studio on the ComfyUI computer and open it on the iPad over Tailscale
   with the access key (and `tailscale serve` for HTTPS). *(Recommended.)* The alternative is
   desktop-only for now.
3. **Phase 1 scope** as listed above. *(Recommended; it already gives a usable pressure-sensitive
   sketchbook connected to the AI side.)*
4. **`.aiwire` import:** Phase 4 *(recommended)*, or earlier if moving work between the iPad app and
   the web matters now.
