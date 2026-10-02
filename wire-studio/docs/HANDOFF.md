# Handoff: state of the workflow expansion and what is left

Written when the session ran out of usage, so another session (any model) can continue.
Branch: `Comfyui_wire_UI`. Read first, in order: `docs/WORKFLOW_RESEARCH.md` (method rules + all
research so far), `docs/WORKFLOW_IMPLEMENTATION_AUDIT.md` (what was built per phase and how it was
verified), `docs/CAPABILITY_MATRIX.md` (generated; also the "Workflow combinations" table).

## Rules the user set (keep following them)

- Families stay independent (Anima, SDXL/Illustrious/NoobAI/Pony, Z-Image, Krea 2). Never weaken
  `assertFamily()` in `engine/index.mjs`. Family-free helpers may only hand masks / images to a
  family's own graph.
- Research every workflow before implementing it; record evidence (repo + commit, file, line) in
  `docs/WORKFLOW_RESEARCH.md`. Unverified → `status: "research"` (RESEARCH_ONLY), not offered.
- Graphs must conform to the live `/object_info`; refuse incomplete graphs (readiness guard).
- Do not break saved settings, history, model selection, launch scripts, API routes; add migration
  logic if a schema changes. Do not alter network behaviour (localhost / LAN / Tailscale config;
  never expose externally by default). Do not delete tests to make code pass. Extend the existing
  architecture minimally; do not redesign it.
- Commit each phase separately; push only to `Comfyui_wire_UI`; no pull request unless asked.
  Never claim support that was not technically verified (no GPU was available: everything is
  "graph validated, not yet run on a GPU" — marked † in the matrix).

## Done (committed and pushed)

| Phase | Commit | Summary |
|---|---|---|
| 0 | `692c3ef`, `5f5365b` | Audit, live validator, capability matrix, task declarations, readiness guard |
| 1 | `ba66599` | Anima LLLite expansion + Img2Img + Control |
| 2 | `3305136` | Z-Image Fun ControlNet Union 2.1 (2602) modes, Lite, combined control + inpaint |
| 3 | `f06f21f` | Krea 2 Identity Edit suite (19 tasks, `engine/families/krea2-edit.mjs`) |
| 4–6 | `becd30a` | Krea 2 Style Reference task, UniDepth depth method, Img2Img + depth, depth-guided outpaint, real pose (OpenPose LoRA via Ostris Edit), combinations table |

Last full verification (at `becd30a`): `npm test` 225/225, browser checks 16/16
(`npm run test:ui`), live ComfyUI 0.38.0 validator 102/102 (`npm run validate:live`).

## In progress: Phases 7–8 (committed as scaffolding, NOT wired yet)

Already in the tree:
- `engine/scene.mjs` — **written, not imported anywhere yet.** Family-free orchestration:
  `subjectMask()` (native BiRefNet `LoadBackgroundRemovalModel → RemoveBackground` first, as the
  official template `utility_birefnet_remove_background`; else ComfyUI-RMBG `BiRefNetRMBG`/`RMBG`
  output 1), `cutOut()` (template's `InvertMask → JoinImageWithAlpha`), `subjectNeeds()`,
  `sceneTasks({ redraw, outpaint, baseNeeds, common, advanced, inpaintNeeds, label })` returning a
  `reframe` task (aspect or exact size + alignment → `c.reframeEdges` → the family's own
  `outpaint.build`, then scale for exact size; inherits outpaint fields such as Krea's depth
  guide) and a `bg-replace` task (modes prompt / image / blur; mask expand via `GrowMask`, feather
  via MaskToImage → ImageBlur → ImageToMask; edge-band cleanup = `MaskComposite(subtract)` of the
  grown and shrunk background mask, redrawn at low denoise with the family's redraw), and
  `withSceneTasks(tasks, kit)` that inserts both after `outpaint`.
- `engine/catalog.mjs`: TASKS `reframe` and `bg-replace` (group Edit); CORE_NODES now include
  `LoadBackgroundRemovalModel, RemoveBackground, InvertMask, GrowMask, MaskComposite, JoinImageWithAlpha`.
- `engine/model-list.mjs`: `birefnet` (models/background_removal/birefnet.safetensors, Comfy-Org/BiRefNet);
  folder registered in `engine/suggested.mjs`, `scripts/build-model-guide.mjs`, `tests/docs.test.mjs`,
  fixture files `bgRemoval` and fixture nodes `LoadBackgroundRemovalModel` / `RemoveBackground`.
- `engine/capabilities.mjs` rows `background` and `reframe` already point at tasks `bg-replace`
  and `reframe`.

Remaining steps for Phases 7–8:
1. In each family module add a `redraw(g, p, ctx, src, mask, denoise)` that returns the redrawn
   image *before* paste-back, using that family's own inpaint method:
   - Anima: loaders + prompts, LLLite inpainting-v2 patch with the mask (as `tasks.inpaint`),
     `SetLatentNoiseMask`, `sampleAndDecode`. Make `tasks.inpaint.build` call it (one implementation).
   - SDXL: loaders + prompts → existing `maskedRedraw(g, m, p, ctx, src, mask, {width,height}, denoise)`.
   - Z-Image: loaders + prompts → existing `maskedRedraw(g, m, p, ctx, src, mask, denoise, null)`.
   - Krea 2: loaders + prompts → existing `maskedRedraw(g, m, src, mask, denoise)`.
   Then wrap each family's `tasks` with `withSceneTasks(tasks, { redraw, baseNeeds, common, advanced, inpaintNeeds, label })`.
2. Switch the Remove-background utility (`buildUtility` in `engine/index.mjs`, readiness
   `result.utility["remove-bg"]`, `TOOLS["remove-bg"]` note) to `cutOut()` so the native model is
   preferred when installed.
3. Add Krea combination "Depth-guided reframe" → `{ task: "reframe", choice: { key: "guide", value: "depth" } }`.
4. Refresh the snapshot (`npm run validate:live -- --snapshot`), then replace the hand-written
   fixture nodes with `live("…")` for the new core mask nodes (GrowMask, InvertMask, MaskComposite,
   JoinImageWithAlpha) — `objectInfo()` in `tests/fixtures.mjs` must contain every node a graph uses.
5. Tests: per family bg-replace (prompt mode samples only the background mask; image/blur modes
   composite + band; subject pixels never redrawn), reframe (edges from aspect, exact size scales,
   "already that shape" refusal, Krea depth guide passes through), native vs RMBG subject mask.
6. `npm run docs`, `npm run export-workflows`, live validation, browser checks, research section
   "Phases 7–8" (official BiRefNet template facts: foreground mask, inverted for
   JoinImageWithAlpha, `birefnet.safetensors` 423.9 MB in `models/background_removal/`), audit
   section, commit "Phases 7–8".

## Not started

- **Phase 9 — Control Map Generator.** The engine has `buildUtility("map")` (`engine/index.mjs`)
  and `utilityCases()`; no UI exposes it. Needed: a UI entry (e.g. "Make control map ▸ kind" in
  the use-as menu and a "Preview map" button under control images), only installed preprocessors
  (`S.inventory.preprocessors`), parameters (resolution, canny thresholds, invert), and "send to
  Control" (set the image + `isMap: true` on the chosen control task). Kinds: canny, depth, pose,
  lineart, scribble, HED, MLSD, gray (`PREPROCESSORS` in `engine/common.mjs`).
- **Phases 10–12 — SDXL reference / identity / multi-control.** Research notes already in
  `WORKFLOW_RESEARCH.md` sources (IPAdapter_plus `a0f451a`: IPAdapterModelLoader,
  IPAdapterAdvanced weight types style transfer / composition / strong style / precise,
  IPAdapterStyleComposition, IPAdapterPreciseStyleTransfer/Composition, IPAdapterTiled, encoder /
  combine embeds; files ip-adapter-plus_sdxl_vit-h + CLIP-ViT-H-14-laion2B-s32B-b79K,
  ip_plus_composition_sdxl. InstantID `72495e8`: InstantIDModelLoader, InstantIDFaceAnalysis,
  ControlNetLoader, ApplyInstantID(weight 0.8, start, end, image_kps?, mask?) and Advanced;
  examples 30 steps CFG 4.5 ddpm/karras; depth example adds ControlNetApplyAdvanced 0.65 / end
  0.35; antelopev2 in insightface/models is not detectable via object_info. PuLID `93e0c4c`:
  research only so far). SDXL only. Multi-control: independent strength / start / end per control.
- **Phase 13 BrushNet SDXL** (only if verified), **Phase 14 automatic masking** (core SAM 3:
  `CheckpointLoaderSimple(sam3.1_multiplex_fp16)` + `SAM3_Detect` — but CheckpointLoaderSimple is
  SDXL-exclusive in `assertFamily`, so masking must be a family-free utility whose MASK result is
  handed to a family task; RMBG `SAM3Segment`, Clothes/Face/Body segmenters; Impact SEGS),
  **Phase 15 detail & restoration**, **Phase 16 output chaining + variations**, **Phase 17 batch
  processing**, **Phase 18 VRAM / performance** (needs a 16 GB GPU), **Phases 19–20 regression +
  live tests + final docs / audit**.
- **Gallery Manager** (user request): multi-select, bulk delete from history (and ComfyUI
  `/history` delete), star, download, filters; deleting files only as an explicit opt-in; tests and
  browser checks; add to `docs/PLAN.md` roadmap.
- **GPU verification** of everything marked † (no GPU was available in this environment).

## Test environment (rebuild in a new session)

The CPU ComfyUI used for `validate:live` lived in the session scratchpad and is gone. To rebuild:
clone ComfyUI (0.38.0 was used), create a venv, install requirements (CPU torch), clone the packs
listed in `WORKFLOW_IMPLEMENTATION_AUDIT.md` → "Live validation environment" (plus
ComfyUI-Krea2-UniDepth `2641b08`) into `custom_nodes/`, create **empty placeholder files** with the
official names in the model folders (the validator only checks names), start with
`python main.py --cpu --listen 127.0.0.1 --port 8288`, then
`COMFY_URL=http://127.0.0.1:8288 npm run validate:live -- --snapshot`. Known gotchas: ComfyUI-RMBG
needs `pycocotools` and `decord`; UltimateSDUpscale needs `git submodule update --init`.
Browser checks: `npm i --no-save playwright-core && CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:ui`.
