# Workflow implementation audit

This is the running audit of the Wire Studio workflow expansion. Each phase adds its section;
the final regression audit closes the document. Status words follow
[CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md) (READY, PARTIAL, EXPERIMENTAL, RESEARCH_ONLY,
MISSING, UNSUPPORTED); the research behind each workflow is in
[WORKFLOW_RESEARCH.md](WORKFLOW_RESEARCH.md).

## How workflows are verified

| Level | What it proves | How |
|---|---|---|
| Unit | The graph builds, every sampler traces to its own family's loaders, mixing is refused, readiness reports what is missing | `npm test` (`tests/engine.test.mjs`) against the hand-written fixture |
| Real node definitions | Node names, every input, required/optional split, combo choices, value ranges and **link types** match the real nodes | `npm test` (`tests/live.test.mjs`) against `tests/live-object-info.json`, a snapshot of a real ComfyUI with all node packs |
| Live ComfyUI | ComfyUI's own `POST /prompt` validator accepts the graph | `COMFY_URL=… npm run validate:live` (nothing is executed: each accepted prompt is removed from the queue) |
| Fixture drift | The hand-written fixture never claims an input, choice or output the real node does not have | `tests/live.test.mjs` |
| Export drift | `workflows/*.json` equal what the engine builds today | `tests/export.test.mjs` |
| Doc drift | `docs/CAPABILITY_MATRIX.md` and `docs/MODEL-FOLDERS.md` equal what the engine declares | `tests/docs.test.mjs` |
| GPU inference | The image is good | **Not available in this environment** (no GPU, no model weights). Every workflow not run on hardware is marked † in the matrix and listed below. |

### Live validation environment

ComfyUI **0.38.0** (commit `2472a20`, 2026-10-02), CPU mode, with these node packs installed
from their upstream repositories (commit, date):

| Pack | Commit | Notes |
|---|---|---|
| comfyui-krea2edit | `86f886d` 2026-07-29 | v1.2.5 |
| ComfyUI-Krea2-Ostris-Edit | `7756566` 2026-07-17 | |
| comfyui-krea2-controlnet | `79ebfd3` 2026-07-04 | |
| ComfyUI_IPAdapter_plus | `a0f451a` 2025-04-14 | upstream in maintenance-only mode |
| ComfyUI_InstantID | `72495e8` 2025-04-14 | |
| PuLID_ComfyUI | `93e0c4c` 2025-04-14 | research only |
| comfyui_controlnet_aux | `0cd2904` 2026-09-28 | |
| ComfyUI-Impact-Pack / Subpack | `429d015` 2026-04-20 / `50c7b71` 2025-07-22 | |
| ComfyUI-RMBG | `229529e` 2026-09-30 | needs `pycocotools` for its SAM 3 module; any failing module hides the real error behind a `module_name` NameError in its loader |
| comfyui-inpaint-nodes | `bd6d8fd` 2026-09-25 | |
| ComfyUI_UltimateSDUpscale | `a5547db` 2026-06-22 | downloads its submodule at import time; offline installs need `git submodule update --init` |
| ComfyUI-ReActor | `a12c5b1` 2026-09-21 | |
| ComfyUI-segment-anything-2 | `0c35fff` 2025-09-28 | |
| comfyui_segment_anything | `ab63955` 2024-03-21 | |

Model folders hold empty placeholder files with the official names: ComfyUI lists them, so
`/object_info` and the validator see a fully set-up machine, but nothing can be executed.

## Phase 0 — baseline audit (before the expansion)

Audited: every file in `engine/`, `lib/`, `server.mjs`, `public/js/`, `tests/`, `scripts/`,
`docs/` and `workflows/`, and the baseline test runs.

**Baseline results:** `npm test` 73/73 · `npm run test:ui` 12/12 browser checks ·
`npm run export-workflows` reproduced `workflows/` byte for byte · **59/59** workflows (51
family workflows + 8 utility graphs) accepted by the live ComfyUI 0.38.0 validator.

### Findings

| # | Area | Finding | Resolution |
|---|---|---|---|
| 1 | Engine — Krea 2 Smart Edit | With the pixel path (`vae` + `source_image`) connected, `Krea2EditModelPatch` rebuilds its source list from `source_image` / `source_image_b` only (`__init__.py`, `wrapper()`). Wire Studio passed the second image as `source_latent_b` alone, so **two-image edits silently dropped the second image from the appearance path** (it still reached the text encoder). | Fixed: `source_image_b` is wired; regression test added. |
| 2 | Engine — validation | `finalize()` checked node types, required inputs, combos and ranges but not **link types or output slots**, which ComfyUI does check. | Added (same rules as ComfyUI's `validate_node_input`). |
| 3 | Inventory | The official SAM 3 / SAM 3.1 checkpoints (Comfy-Org template puts them in `checkpoints/`), Depth Anything and BiRefNet files were classified *unknown* and **offered as SDXL checkpoints** ("unrecognized names" group). | Classified as other families; test added. |
| 4 | Test fixture drift | The hand-written `/object_info` fixture disagreed with the real nodes: `Krea2EditModelPatch.fit_mode` choices (`crop` vs real `crop (legacy)`), `fit_mode`/`ref_boost` and `Krea2EditGroundedEncode.image`/`grounding_px` required in the fixture but optional upstream, missing `source_image_b` / `ref_boost_mask` / `system_prompt` (so the conform step would have **silently dropped them in tests**), `BiRefNetRMBG` model `BiRefNet_HR` (real `BiRefNet-HR`), `background_color` type, outputs, and the new required `UltimateSDUpscale.batch_size`. | Fixture corrected; a drift test now fails on any input, choice or output the fixture invents or omits. |
| 5 | Exports | `workflows/` matched the engine, but nothing enforced it. | `tests/export.test.mjs`. |
| 6 | Docs | `PLAN.md` quoted 64 tests and 11 browser checks (actual 73 and 12). The capability statement was prose only. | Counts removed from PLAN.md; the capability matrix is now generated from the engine. |
| 7 | Krea 2 Smart Edit defaults | The edit pack author's v1.2 workflow presets `ref_boost` 4 ("recommended … much stronger face + body likeness") and Turbo 10 steps; Wire Studio's slider allowed only 0.5–1.5 (default 1) and used 8 steps. | Addressed in Phase 1 (task-specific defaults). |
| 8 | Docs — verification | `WORKFLOWS.md` lists what was not run on hardware; the matrix now carries this per cell (†). | — |

No architecture leakage was found: every sampler / detailer in all 51 workflows traces back to
its own family's loaders (`tests/engine.test.mjs`), and `assertFamily()` rejects foreign
nodes, models, LoRAs, encoders, VAEs, patches and ControlNets.

### Capability matrix at baseline

See the generated [CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md); at baseline it read:

| Capability | Anima | SDXL | Z-Image | Krea 2 |
|---|---|---|---|---|
| Generate | READY | READY | READY | READY † |
| Img2Img | READY | READY | READY | READY † |
| Inpaint | READY | READY | READY † | PARTIAL † |
| Outpaint | READY | READY | READY † | PARTIAL † |
| Control | READY † | READY † | READY † | PARTIAL † |
| Pose | PARTIAL † | READY † | READY † | EXPERIMENTAL † |
| Depth | READY † | READY † | READY † | READY † |
| Canny | READY † | READY † | READY † | MISSING |
| Lineart | READY † | READY † | UNSUPPORTED | MISSING |
| Face Fix | READY | READY | READY † | READY † |
| Hand Fix | READY | READY | READY † | READY † |
| Face Swap | UNSUPPORTED | READY † | READY † | READY † |
| Upscale | READY | READY | READY | READY † |
| Remove Background | READY † (shared) | READY † | READY † | READY † |
| Style Reference | UNSUPPORTED | MISSING | MISSING | READY † |
| Identity Editing | UNSUPPORTED | MISSING | MISSING | READY † (two-image defect, #1) |
