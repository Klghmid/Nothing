# Wire Studio — plan and architecture

## Goal

A local web app that wires to any ComfyUI and runs the best-known workflow for each task and each
model family (Anima, SDXL, Z-Image, Krea 2), without the user ever editing a node graph, importing
JSON or wondering which model goes where. Each family's workflows are independent; nothing mixes.

## What changed compared with Anima Studio 1.5.1

Anima Studio (the uploaded project) proved the core idea: build graphs in code, validate them
against the live ComfyUI, keep families apart. Wire Studio keeps that engine design and its live
findings, and rebuilds the rest:

| Area | Anima Studio 1.5.1 | Wire Studio |
|---|---|---|
| Families | Anima, SDXL, Z-Image | + **Krea 2** (Turbo / RAW, style reference, Smart Edit, depth control) |
| Tasks | generate, edit (+face/hand/pose children), inpaint, outpaint, upscale, remove-bg | one flat list per family: Text to Image, Image to Image, Smart Edit, Inpaint, Outpaint, Face Fix, Hand Fix, **Face Swap**, **Pose**, **ControlNet**, Upscale |
| Control | SDXL pose only | ControlNet + Pose in every family, each with its own control model |
| Family code | 3 adapters sharing one long builder pattern | one self-contained module per family: loaders, prompts, defaults, form schema, requirements, builders |
| Robustness | hand-picked inputs per node | every graph is *conformed* to your `/object_info` (defaults filled, unknown inputs dropped, numbers clamped, combos checked) |
| UI | 5 layered stylesheets, 2,700-line script, many nested options | one stylesheet with tokens, 7 small ES modules, forms drawn from the family schema |
| Setup | per-tool status text | a readiness matrix (family × task) with the exact file, folder, download link or node pack for anything missing |
| Storage | jobs.json rewritten on progress, browser-only form state | in-memory stores with debounced atomic writes + `.bak` recovery; form state on the server; workflows in separate files |

## Architecture

```
browser (public/)                 Wire Studio server (server.mjs)                ComfyUI
┌──────────────────────┐  HTTP   ┌───────────────────────────────────┐  HTTP   ┌──────────┐
│ app.js   shell, run  │ ──────▶ │ /api/bootstrap  one request start │ ──────▶ │ /prompt  │
│ form.js  schema form │         │ /api/run        build → validate  │         │ /queue   │
│ stage.js canvas/mask │ ◀────── │ /api/events     SSE live updates  │ ◀────── │ /history │
│ views.js setup etc.  │   SSE   │ engine/  family workflow builders │   WS    │ /ws      │
└──────────────────────┘         │ lib/     store · comfy · jobs     │         └──────────┘
                                 └───────────────────────────────────┘
```

- **engine/** builds workflows. `families/<id>.mjs` is everything one family knows; `common.mjs`
  holds family-free blocks (masks, paste-back, preprocessors, detailer, ReActor, upscale);
  `graph.mjs` conforms and validates; `index.mjs` dispatches, guards family purity and computes
  readiness; `inventory.mjs` sorts installed files into families (your Library assignment >
  folder name > file name).
- **lib/** is plumbing: `store.mjs` (persistence), `comfy.mjs` (HTTP client with timeouts and a
  stale-while-revalidate `/object_info` cache), `progress.mjs` (ComfyUI websocket → step progress
  and preview frames), `jobs.mjs` (queue tracking, cancel, history).
- **public/** has no build step and no framework. The server sends the form schema, so a family
  only ever shows the controls its workflow uses.

## UI principles

1. **Family first, then task.** The family switch sets the accent colour, the task list and every
   default; switching never carries another family's model or LoRA along.
2. **Only what the workflow uses.** Forms come from the family schema: no dead options, no
   "this does nothing for this model" fields. Rarely changed settings sit in one *Advanced* fold.
3. **Never a silent failure.** A task that cannot run says why before you press anything
   (needs setup / works but add-ons recommended / not offered for this family), with the fix.
4. **The canvas is the workspace.** Inputs, mask painting, outpaint preview, live progress,
   before/after compare and recent results all live in the centre; results can be sent to any
   other task in one click ("Use as input").
5. **Nothing to remember.** Form values, the last family/task and job history are saved on the
   server, so reloading or switching browsers loses nothing.

## Data: storing and loading without delays

| Data | Where | How |
|---|---|---|
| Connection, last family/task, client id | `data/settings.json` | read once at start, kept in memory |
| Form values per family/task | `data/forms.json` | browser saves 450 ms after the last change |
| Job history (≤ 1000, starred kept) | `data/jobs.json` | written on status changes only, never per progress step |
| Exact workflow of each job | `data/workflows/<id>.json` | written once, read for "Workflow" downloads |
| Model/LoRA family assignments | `data/assignments.json` | Setup → Library |
| Last inventory + readiness | `data/inventory-cache.json` | lets the UI paint instantly while ComfyUI is slow or offline |
| Result → input copies | `data/promoted.json` | each result is uploaded to ComfyUI's input folder only once |

All stores are read synchronously at start-up, served from memory, and written back debounced
and atomically (temp file → rename, previous version kept as `.bak` and used automatically if a
file is ever damaged). The page loads with **one** request (`/api/bootstrap`); live updates
arrive over Server-Sent Events instead of polling; images stream through the server with
long-lived cache headers and small WebP thumbnails from ComfyUI's own `preview` parameter.

## Testing

- `npm test` — no GPU: every family × task builds and validates; every sampler and
  detail pass traces to its own family's loaders; mixing is refused; readiness with and without
  custom nodes; every workflow against **real node definitions** captured from a live ComfyUI
  (`tests/live-object-info.json`, including link types); the test fixture, `workflows/` and the
  generated docs may not drift from the engine; and the server end to end against a mock ComfyUI
  (upload, run, SSE progress, results, cancel, restart persistence, `.bak` recovery, library
  assignment, reconnect).
- `npm run validate:live` — every workflow sent to a running ComfyUI's own validator
  (`COMFY_URL=…`; nothing is executed). `-- --snapshot` refreshes the node-definition snapshot.
- `npm run test:ui` — browser checks (desktop + phone) with Playwright against the mock.
- Real-GPU checks still to do: the † cells of `docs/CAPABILITY_MATRIX.md`, listed in
  `docs/WORKFLOW_IMPLEMENTATION_AUDIT.md`.

## Roadmap

1. **Live verification pass** on a real ComfyUI for everything marked *not yet run on real
   hardware*, recording results in a test report (as Anima Studio did).
2. **Krea 2 canny / line art** as soon as public control-LoRAs appear (pose arrived as an
   Ostris-Edit LoRA and has its own path; depth has two). Style + depth / pose / identity once a
   tested combination exists (reasons in `CAPABILITY_MATRIX.md` → Workflow combinations).
3. **SDXL identity options**: InstantID / PuLID face reference for generation (SDXL-only), next to
   the ReActor face swap.
4. **Batch runs** (a folder of images through Face Fix, Upscale or Remove background).
5. **Hash-verified model identity** if ComfyUI exposes trusted model hashes, to sort unusual file
   names without manual assignment.
6. **Optional prompt assistant** (local OpenAI-compatible endpoint) per family prompt style.
