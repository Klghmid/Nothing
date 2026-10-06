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
| ComfyUI-Krea2-UniDepth | `2641b08` 2026-08-02 | v0.3.0; needs ComfyUI ≥ 0.29.2 (native Krea 2 reference latents) |
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

## Phase 1 — Anima LLLite expansion and controlled Img2Img

Research: [WORKFLOW_RESEARCH.md § Phase 1](WORKFLOW_RESEARCH.md#phase-1--anima-lllite-control-and-controlled-img2img).

| Workflow | Status | Required | Tests | Export |
|---|---|---|---|---|
| Anima · ControlNet · line art / canny / scribble | READY † (unchanged path; patch choice fixed) | `AnimaLLLiteApply` (core), `anima-lllite-any-test-like-v2` (or legacy `lineart-1` / `scribble-1`) | preference order, file order independence | `anima/control-{lineart,canny,scribble}.json` |
| Anima · ControlNet · **grayscale** (new) | READY † | any-test-like-v2; `ImageLuminanceDetector` (comfyui_controlnet_aux) or an uploaded grayscale map | luminance map, no inversion, refused without v2 | `anima/control-gray.json` |
| Anima · ControlNet · **any (your own drawing)** (new) | READY † | any-test-like-v2 | no preprocessor, never offered on a source photo | `anima/control-any.json` |
| Anima · ControlNet · depth | READY † | `anima-lllite-depth-1`; **native Depth Anything 3** when installed, else Depth Anything V2 (aux) | native first, aux fallback, dynamic-combo inputs kept | `anima/control-depth.json` |
| Anima · **Img2Img + Control** (new) | READY † (pose type PARTIAL) | as above + `anima-lllite-pose-1` for pose | encoded source latent, map from the source or a separate image, ready maps only for the separate image | `anima/img2img-control-*.json` |

Engine changes made for this phase, each covered by tests: ordered patch preference (latent
defect: alphabetical file order could select a legacy patch), the `controlPatches` inventory list
and *Advanced → Control patch* picker (inpaint patches excluded, other families' patches refused),
preprocessor entries that are native node chains with a model requirement (Depth Anything 3), and
dynamic-combo support in `finalize()` and the validator.

Results: `npm test` 156/156 · browser checks 13/13 · live ComfyUI 0.38.0 validator 68/68
workflows (incl. the DA3 chain with a placeholder `depth_anything_3_mono_large.safetensors`).
Not run on a GPU: every new Anima workflow (†).

Not in this phase (later phases of the plan): Anima object remove / replace, background replace,
regional edit, guided outpaint and reframe (Phases 7–8 build these on each family's own masked
redraw), and the enhancement workflows (Phase 15).

## Phase 2 — Z-Image Fun ControlNet Union 2.1 (2602)

Research: [WORKFLOW_RESEARCH.md § Phase 2](WORKFLOW_RESEARCH.md#phase-2--z-image-fun-controlnet-union-21-2602-combined-control-lite).

| Workflow | Status | Required | Tests | Export |
|---|---|---|---|---|
| Z-Image · ControlNet · canny / HED / depth / pose / M-LSD | READY † (now picks the newest full patch with the mode) | `ZImageFunControlnet` (core), a Fun ControlNet Union patch | mode-aware choice, lite override | `zimage/control-*.json` |
| Z-Image · ControlNet · **scribble** (new) | READY † | Union **2.1** (2601 or 2602, full or lite) | refused on 1.0-only machines, hidden in the UI | `zimage/control-scribble.json` |
| Z-Image · ControlNet · **gray** (new) | READY † | Union 2.1 **2602**; `ImageLuminanceDetector` or a ready grayscale map | refused with 2601 only, hidden in the UI | `zimage/control-gray.json` |
| Z-Image · **Lite** control model (new) | READY † | `…-lite-2602-8steps` or `…-lite-2601-8steps` | *Advanced → Control model*; the same workflows | — |
| Z-Image · **Img2Img + Control** (new; Restyle = high change strength) | READY † | as ControlNet | encoded latent, control before the AuraFlow shift | `zimage/img2img-control-*.json` |
| Z-Image · **Inpaint + structure guide** (new) | READY † | Union **2.x** (inpaint mode) | one combined call, map at the inpaint size, refused with 1.0 | — |
| Z-Image · **Outpaint + guide image** (new) | READY † | Union 2.x | guide only from a separate whole-canvas image (else noted and skipped) | — |
| Z-Image · Tile restore | RESEARCH_ONLY | — | — | — |

Findings during the phase: the official Z-Image control blueprints still use
`QwenImageDiffsynthControlnet`; `ZImageFunControlnet` is its newer subclass (same code + optional
`inpaint_image`), so Wire Studio's choice stands. The representative exports now use the current
2602 patch (only the patch file name changed in the 9 affected files).

Results: `npm test` 169/169 · browser checks 14/14 · live ComfyUI validator 77/77 (with 2601,
2602, lite-2602 and a Tile placeholder installed — the Tile file is never picked).
Not run on a GPU: all new Z-Image workflows (†). Deferred to later phases of the plan: Z-Image
object remove / replace, background replace, structure-preserving and controlled regional edits
(built with the editing phases on each family's masked redraw), Control + Reframe (Phase 8 reuses
Outpaint, so it inherits the guide).

## Phase 3 — Krea 2 Identity Edit Suite

Research: [WORKFLOW_RESEARCH.md § Phase 3](WORKFLOW_RESEARCH.md#phase-3--krea-2-identity-edit-suite).
Implementation: `engine/families/krea2-edit.mjs` (part of the Krea 2 family: it receives
`krea2.mjs`'s own loaders; one shared `identityEdit()` graph, no second architecture).

| Task | Status | Distinct from the others by | Export |
|---|---|---|---|
| Smart Edit | READY † | free instruction, optional image 2 | `krea2/edit.json` |
| Object Remove | READY † | RAW preferred + removal preset (20 steps, CFG 3), ref_boost 1, grounding 512, locality mask | `krea2/k2-remove.json` |
| Object Replace | READY † | object → replacement, optional object photo as image 2, locality mask | `krea2/k2-replace.json` |
| Background Swap | READY † (text) / EXPERIMENTAL (with a background photo: order inferred) | background photo becomes image 1 | `krea2/k2-background.json` |
| Person Replace | READY † | who → new person (text or photo), grounding 1024 | `krea2/k2-person.json` |
| Insert Person | READY † | scene + person (documented two-image case) | `krea2/k2-insert.json` |
| Face Replace | READY † | documented face-swap sentence, face-focused `ref_boost_mask` | `krea2/k2-face.json` |
| Head Replace | READY † | head + hair sentence, wider focus region | `krea2/k2-head.json` |
| Eye Replace | READY † | eyes only, text or reference | `krea2/k2-eyes.json` |
| Outfit Change | READY † | outfit + layering words | `krea2/k2-outfit.json` |
| Virtual Try-On | READY † | person + garment, garment fidelity on image 2 | `krea2/k2-tryon.json` |
| Identity Inpaint | EXPERIMENTAL † | required mask, masked latent + differential diffusion, paste-back | `krea2/k2-inpaint.json` |
| Identity Outpaint | EXPERIMENTAL † | padded canvas, masked latent, euler advice | `krea2/k2-outpaint.json` |
| Identity Reframe | EXPERIMENTAL † | target aspect + alignment → computed extension, then Identity Outpaint | `krea2/k2-reframe.json` |
| Character Variation | EXPERIMENTAL † | ref_boost 0.7 (below 1 frees), batch of 4, free size | `krea2/k2-variation.json` |
| Character Restage | READY † | "Create a photo of this person …", free size | `krea2/k2-restage.json` |
| Character Sheet | READY † | views / expressions, wide default (1536×1024) | `krea2/k2-sheet.json` |
| Scene Change | READY † | whole setting + light, grounding 512 | `krea2/k2-scene.json` |
| Pose Restage | EXPERIMENTAL † | pose photo as image 1 (inferred order) or text pose | `krea2/k2-pose.json` |

Requirements for all: Krea 2 model, Qwen3-VL 4B (`krea2`), Qwen Image VAE, `Krea2EditModelPatch`
+ `Krea2EditGroundedEncode` (comfyui-krea2edit ≥ v1.2.5 — `source_image_b`, `ref_boost`,
`ref_boost_mask`, `target_latent`), `krea2_identity_edit_v1_2.safetensors`. Recommended: Impact
Pack + Subpack + `face_yolov8m.pt` (face focus), `DifferentialDiffusion` (masked tasks),
comfyui-inpaint-nodes (outpaint pre-fill).

Changes to the existing Smart Edit (intended, from the author's v1.2 workflow): Turbo 10 steps
(was 8), `ref_boost` 4 (was 1), slider range 0–10 (was 0.5–1.5); the unused negative-prompt field
was removed. UI: optional masks, single-line fields, task-level Turbo / RAW presets, a preferred
model type per task, collapsible task groups (desktop).

Tests: a "not an alias" test builds all 19 tasks and fails if two produce the same graph; order,
defaults, RAW preference, locality, face focus (with and without Impact), masked latent,
`target_latent` wiring, reframe geometry and the reframe calculator have dedicated tests.
Results: `npm test` 210/210 · browser checks 15/15 · live ComfyUI validator 95/95.
Not run on a GPU: all 19 tasks (†). Sources of uncertainty are listed in the research report.

## Phases 4–6 — Krea 2 Style Reference, advanced Depth, real Pose

Research: [WORKFLOW_RESEARCH.md § Phases 4–6](WORKFLOW_RESEARCH.md#phases-46--krea-2-style-reference-advanced-depth-real-pose).
Implementation: `engine/families/krea2.mjs` — `styleReference()` (shared by Text to Image and the
new Style Reference task), `depthControl()` (Control-LoRA) and `uniDepth()` (UniDepth) behind one
*Depth method* choice, `poseConditioning()` for the pose LoRA. The family declares its
`combinations`, from which [CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md#workflow-combinations)
generates the combinations table (offered ones take their status from the task that runs them;
the others carry their reason).

| Workflow | Status | What it builds | Export |
|---|---|---|---|
| Style Reference (prompt) | READY † | official template, up to three references | `krea2/style-prompt.json` |
| Style Reference (redraw an image) | EXPERIMENTAL † | the same conditioning, VAE-encoded source, partial denoise, shift for the source size | `krea2/style-img2img.json` |
| ControlNet → Depth, Control-LoRA | READY † (unchanged) | Patil depth Control-LoRA (facok nodes) | `krea2/control-depth.json` |
| ControlNet → Depth, UniDepth | EXPERIMENTAL † | UniDepth LoRA loader → UniDepth Conditioning (depth, reference image, stacked second reference, window, calibration) | `krea2/control-depth-unidepth.json` |
| Img2Img + Control → Depth | EXPERIMENTAL † | encoded source; Control-LoRA control latent sized from it, or UniDepth `target_latent` | `krea2/img2img-control-depth.json`, `…-depth-unidepth.json` |
| Outpaint with depth guide | EXPERIMENTAL † | depth of the pre-filled padded canvas through the Control-LoRA on the masked latent; paste-back as before | `krea2/outpaint-depth.json` |
| Pose (rebuilt) | EXPERIMENTAL † | Ostris Edit patch → OpenPose LoRA, pose map as image 1 of both prompts, 10 steps CFG 1 | `krea2/pose.json` |
| Pose from a start image | EXPERIMENTAL † | the same with an encoded start image and partial denoise | `krea2/pose-source.json` |

Not offered, with the reason in the generated table: Style + Identity and Depth + Identity
(UNSUPPORTED), Style + Depth, Style + Pose, Pose + Style, Pose + Identity + Style and the
s-adhit pose package (RESEARCH_ONLY).

Requirements: style — `krea2_style_reference.safetensors`; UniDepth — the
`Krea2UniDepth*` nodes (ComfyUI-Krea2-UniDepth) and `krea2_unidepth_depth_exp_v1.safetensors` in
`loras/krea2/`; pose — `Krea2OstrisEditModelPatch` + `TextEncodeKrea2OstrisEdit`
(ComfyUI-Krea2-Ostris-Edit) and `krea2_turbo_openpose_controlnet.safetensors` in
`loras/krea2/control/`, plus a pose preprocessor (DWPose) unless a skeleton is uploaded. The
inventory keeps three lists apart (`controlLoras` for the facok loader, `poseLoras`,
`unidepthLoras`), and the safety check refuses a LoRA sent to a loader that is not made for it.

Changes to existing behaviour (intended):
- **Krea 2 Pose** no longer uses the depth path. Old saved Pose settings still build; the old
  *depth map* switch is ignored by Pose (a new *pose skeleton* switch replaces it). Without the
  pose LoRA the task now reports exactly that file as missing instead of running a depth
  transfer.
- The depth Control-LoRA picker now skips UniDepth and pose LoRAs even when their file name says
  "depth" or they sit in `loras/krea2/control/` (before, a UniDepth LoRA named `…depth…` would
  have been handed to the facok loader, which cannot read it).
- Text to Image keeps its optional style fields (saved settings), now built by the same
  `styleReference()` as the Style Reference task.

Tests: dedicated tests for the style graph (three references, the third only with a second,
redraw latent and shift, refusal without the LoRA), the two depth paths (LoRA separation,
reference order, window always valid, UniDepth used alone when it is the only one, refusal with
neither, feature flag), control-latent sizing for img2img and depth-guided outpaint, the pose
graph (Ostris patch before the LoRA, image 1 in both prompts, published settings, no depth node,
skeleton upload, old depth switch ignored, start image, refusal naming the missing file), and the
safety check for task LoRAs. The family-purity test now builds **every exported variant** of every
task, not only one parameter set. Browser: Style Reference modes, Depth method and UniDepth
fields, Pose. Results: `npm test` 225/225 · browser checks 16/16 · live ComfyUI validator
102/102. Not run on a GPU: everything in this section (†).

## Phases 7–8 — Background Replace and Reframe

Research: [WORKFLOW_RESEARCH.md § Phases 7–8](WORKFLOW_RESEARCH.md#phases-78--background-replace-and-reframe-every-family).
Implementation: `engine/scene.mjs` (family-free: `subjectMask`, `cutOut`, `subjectNeeds`,
`sceneTasks`, `withSceneTasks`) and one `redraw()` per family — its existing inpaint method
returning the image before paste-back (Anima's Inpaint now calls the same `inpaintRedraw()`; its
graph is structurally identical to before, only node numbers changed).

| Workflow | Families | Status | Export |
|---|---|---|---|
| Background Replace — describe | Anima, SDXL, Z-Image, Krea 2 | EXPERIMENTAL † | `<family>/bg-replace-prompt.json` |
| Background Replace — photo (+ edge blend) | all four | EXPERIMENTAL † | `<family>/bg-replace-image.json` |
| Background Replace — blur (+ edge blend) | all four | EXPERIMENTAL † | `<family>/bg-replace-blur.json` |
| Reframe — aspect ratio + alignment | all four | the family's Outpaint status † | `<family>/reframe.json` |
| Reframe — exact size | all four | as above | `<family>/reframe-size.json` |
| Reframe — depth guide | Krea 2 | EXPERIMENTAL † | `krea2/reframe-depth.json` |
| Remove background (tool) | — | READY † (now native BiRefNet first) | — |

Requirements: Background Replace — the family's base models, plus `birefnet.safetensors` in
`models/background_removal/` (native `RemoveBackground`) **or** ComfyUI-RMBG; the family's inpaint
add-ons stay recommended. Reframe — exactly the family's Outpaint requirements.

Tests: every family — only the background mask is sampled, the subject is pasted back from the
original, a background photo is fitted to the photo, the edge band is a subtract of grown and
shrunk masks at strength 0.35, blur without blending uses no model; RMBG fallback (mask output 1);
Reframe edges for an aspect ratio and alignment, exact-size scaling, "already that shape"
refusal, same shape only resized, Krea 2 depth guide kept; Remove background native vs RMBG. The
purity test covers every variant. Results: `npm test` 256/256 · browser checks 17/17 · live
ComfyUI validator 123/123. Not run on a GPU (†).

## Phase 9 — Control Map Generator

The family-free map tool (`buildUtility("map")`, `engine/index.mjs`) already built a map with the
first installed preprocessor for each type (`PREPROCESSORS`, `engine/common.mjs`: native Canny and
Depth Anything 3 first, then comfyui_controlnet_aux). Phase 9 adds the UI and parameters:

- **Where:** a *Make map* button on image slots of every Control task, and *Make control map…* in
  the *Use as input* menu of any result.
- **Dialog** (`mapTool`, `public/js/views.js`): only installed types are offered (canny always;
  the others from the inventory's `preprocessors`), with the missing ones named; resolution of the
  long side (256–2048, never upscaled — it also sets the detection resolution); canny thresholds;
  invert. The map runs as a tool job, appears in history and opens in the viewer (save / download
  from there).
- **Send to Control:** *Use as input* on a map result puts it into the task's separate control
  image when it has one (else its image), ticks *already a map* (or *pose skeleton* for a pose
  map on Krea 2) and selects the map's type when the task offers it.

Tests: map long side, no upscaling, thresholds and invert reach the graph, `controlKinds` in the
schema; browser: make a depth map from a ControlNet image, open it, use it in ControlNet → the
map switch is on and the type is Depth. Results: `npm test` 256/256 · browser checks 18/18 · live
validator 123/123 (the map graphs per installed type are part of it).

## Phases 10–12 — SDXL Image Reference, Identity Reference, Multi-Control

Research: [WORKFLOW_RESEARCH.md § Phases 10–12](WORKFLOW_RESEARCH.md#phases-1012--sdxl-image-reference-identity-reference-multi-control).
Implementation: `engine/families/sdxl-reference.mjs` (part of the SDXL family; it receives
`sdxl.mjs`'s loaders, prompts, ControlNet helpers and masked redraw) — `applyReference()`,
the control slots (`controlFields` / `applyControls`), the `reference` and `identity` tasks.
`applyNet()` now takes a start point and loads each ControlNet file once per graph.

| Workflow | Status | Export |
|---|---|---|
| Image Reference: subject / style / composition / style + composition / precise style / precise composition | READY † | `sdxl/reference-<mode>.json` |
| Image Reference: regional, from an image (masked), inpaint, + ControlNet | EXPERIMENTAL † | `reference-regional`, `-style-img2img`, `-subject-inpaint`, `-style-controlnet` |
| Image Reference: tiled, multiple references | READY † | `reference-subject-tiled`; any mode with a second reference |
| Identity Reference (InstantID) + prompt, head pose, depth, general look | READY † | `sdxl/identity.json`, `-pose`, `-depth` |
| Identity + img2img, canny / other controls, style-only / composition-only, multi-control | EXPERIMENTAL † | `identity-img2img`, `-style`, `-multi-control` |
| ControlNet with up to two more controls (multi-control) | EXPERIMENTAL † | `sdxl/control-multi.json` |

Inventory: `ipadapters` (SDXL files only), `clipVisions`, `instantid`, `instantidNets` (the InstantID
ControlNet is kept out of the general ControlNet list). Safety check: IPAdapter / InstantID nodes
are SDXL-only, an IPAdapter file must be an SDXL one, the InstantID ControlNet is only accepted
next to InstantID. New model folders `ipadapter/`, `clip_vision/`, `instantid/` in the guide.

UI: the canvas image is now the first image field *shown* for the current values, and the mask
painter appears only when the mask field is shown, so "Start from: a prompt / an image / a painted
area" switches the canvas between the reference and the source; a choice that shows or hides an
image or mask field re-renders the stage.

Tests: every reference mode's node / weight type, model and encoder pick (bigG for ViT-G),
regions, masked reference, inpaint paste-back, refusals; InstantID defaults equal the basic node,
author's sampling, pose, depth example values, style after InstantID, img2img, multi-control,
refusal naming the missing ControlNet file; multi-control ranges and one loader per file; safety
checks. Results: `npm test` 280/280 · browser checks 19/19 · live validator 141/141. Not run on a
GPU (†); antelopev2 cannot be checked from Wire Studio.

