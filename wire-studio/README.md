# Wire Studio

A clean local front-end that wires to your **ComfyUI** and runs tested, independent workflows for
four model families — **Anima, SDXL (Illustrious / NoobAI / Pony), Z-Image and Krea 2** — without
touching a node graph.

Pick a family, pick a task, fill a short form, press **Generate**. Every family has its own
workflow for every task, built from the official ComfyUI templates, checked against your ComfyUI
before it runs, and never mixed with another family's models.

| Create | Edit | Fix | Control | Finish |
|---|---|---|---|---|
| Text to Image · Style Reference (Krea 2) · Image to Image | Inpaint · Outpaint · Reframe · Background Replace · Krea 2 Identity Edit suite (Smart Edit, Object Remove / Replace, Background Swap, Person / Face / Head / Eye Replace, Insert Person, Outfit, Try-On, Scene Change, Restage, Sheet, Variation, Pose Restage, Identity Inpaint / Outpaint / Reframe) | Face Fix · Hand Fix · Face Swap | Pose · ControlNet · Img2Img + Control | Upscale · Remove background |

See [docs/WORKFLOWS.md](docs/WORKFLOWS.md) for what each family runs for each task and why, and
[docs/PLAN.md](docs/PLAN.md) for the architecture and roadmap, and
[docs/SKETCH-PLAN.md](docs/SKETCH-PLAN.md) for the planned Sketch workspace (Photoshop-style,
pen pressure on desktop tablets and iPad). Every workflow is also available as
a standalone ComfyUI file in [workflows/](workflows/README.md).

## Start

Requires **Node.js 20+** (22+ adds live step progress and previews). No `npm install` needed.

```bash
cd wire-studio
./start.sh              # Linux / macOS  (or double-click "Start Wire Studio.command" on macOS)
start.bat               # Windows
```

Open **http://127.0.0.1:5180**. The first time, **Setup** opens: enter your ComfyUI address
(the one you open in the browser, e.g. `http://127.0.0.1:8188`) and press **Connect**.

Options: `PORT=5190 ./start.sh`, `COMFY_URL=http://192.168.1.20:8188 ./start.sh`,
`./start.sh --no-browser`. The server listens on 127.0.0.1 only; it has no login, so do not
expose it to the internet.

## Setting up ComfyUI

**Setup → What is ready** shows a family × task grid. Select any cell to see exactly which nodes
and model files that workflow uses: the suggested file name and its folder, the installed file it
uses, and a download link for anything missing. **Setup → Suggested models & LoRAs** lists every
suggested file per family (Anima, SDXL, Z-Image, Krea 2, shared helpers) and marks each one
installed, covered by another file, or missing. **Re-check** after installing.

Models are sorted into families by **folder** first (at any depth), then by file name, and a
`turbo/` or `regular/` folder picks the sampling preset:

```
models/checkpoints/SDXL/regular/        models/checkpoints/SDXL/turbo/
models/diffusion_models/anima/…         models/diffusion_models/z-image/turbo/   …/krea2/regular/
models/loras/anima/<any sub-folders>    models/loras/SDXL/…   models/loras/z-image/…   models/loras/krea2/…
models/loras/krea2/editor/   ← Smart Edit LoRA       models/loras/krea2/control/   ← Krea 2 Control-LoRAs
```

The full layout, every file and where it goes, is in the **ComfyUI models guide** (every model, its folder and a sample folder tree):
[docs/MODEL-FOLDERS.md](docs/MODEL-FOLDERS.md), also at http://127.0.0.1:5180/guide and from
**Setup → Library**. A file whose family cannot be told appears under **Setup → Library**;
assign it to a family once and it is remembered. Files in a folder ComfyUI cannot load them from
(for example a Z-Image model under `checkpoints/`) are listed there with where to move them.

Custom node packs used by some tasks (each task tells you if it needs one):
[Impact Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) + [Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack) (face / hand fix),
[ReActor](https://github.com/Gourieff/ComfyUI-ReActor) (face swap),
[comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) (pose / depth / line-art maps — optional if you upload ready maps),
[comfyui-inpaint-nodes](https://github.com/Acly/comfyui-inpaint-nodes) (smoother outpaint),
[ComfyUI_UltimateSDUpscale](https://github.com/ssitu/ComfyUI_UltimateSDUpscale) (refine above 2304 px),
[ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) (remove background),
[comfyui-krea2-controlnet](https://github.com/facok/comfyui-krea2-controlnet), [ComfyUI-Krea2-UniDepth](https://github.com/cicalooo/ComfyUI-Krea2-UniDepth), [ComfyUI-Krea2-Ostris-Edit](https://github.com/ostris/ComfyUI-Krea2-Ostris-Edit) and [comfyui-krea2edit](https://github.com/lbouaraba/comfyui-krea2edit) (Krea 2 add-ons: depth, depth with references, pose, identity edit).

## Using it

- **Images**: upload, drag & drop, paste (Ctrl+V anywhere) or **From results**.
- **Inpaint**: paint directly on the image (Brush / Erase, size, undo with Ctrl+Z, invert, clear).
- **Results**: before/after slider for edits, full-screen viewer (← →), **Use as input** for any
  other task, **Reuse settings** (restores the exact seed), **Workflow** (download the exact graph
  that ran), star, download.
- **Queue**: several runs can wait in line; cancel stops only Wire Studio's own jobs.
- **Export workflow** (under the Run button): the current form as a ComfyUI API-format file.
- Ctrl/⌘+Enter runs; Esc closes overlays. Light and dark themes in Setup.

## Your data

Everything stays on your machine: `wire-studio/data/` holds the connection, your form values, job
history, the exact workflow of each job and your Library assignments. Images stay in ComfyUI's own
input/output folders. Writes are atomic with a `.bak` copy, so a crash cannot corrupt your data.

## Development

```bash
npm test                    # 73 tests: every workflow + the server against a mock ComfyUI
npm run dev:mock            # the app on :5180 against a mock ComfyUI on :8199 (no GPU)
npm i --no-save playwright-core && npm run test:ui     # 12 browser checks (desktop + phone)
npm run export-workflows    # regenerate workflows/
```

Layout: `engine/` (workflow builders, one file per family), `lib/` (storage, ComfyUI client,
jobs, progress), `public/` (UI, no build step), `tests/`, `docs/`.

Credits: the graph-building approach and several live-tested fixes come from Anima Studio 1.5.1.
