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
| 7–8 | `4d04304` | Background Replace (describe / photo / blur, edge blend) and Reframe (aspect / exact size, alignment) for every family; native BiRefNet for Remove background |
| 9 | `5ea6275` | Control Map Generator UI (installed types, resolution, thresholds, invert, send to Control) |
| 10–12 | (this commit) | SDXL Image Reference (IPAdapter), Identity Reference (InstantID; PuLID research-only), multi-control (3 ControlNets) |

Last full verification (Phases 10–12): `npm test` 280/280, browser checks 19/19
(`npm run test:ui`), live ComfyUI 0.38.0 validator 141/141 (`npm run validate:live`).

## Phases 7–12 — done

Phases 10–12: `engine/families/sdxl-reference.mjs` (Image Reference, Identity Reference, control
slots). See the Phases 10–12 sections of the research report and the audit.

### Phases 7–9

Phase 9 (Control Map Generator): *Make map* on Control-task image slots and *Make control map…*
in the *Use as input* menu; installed types only, resolution, canny thresholds, invert; a map
result used as input is marked as a ready map. See the Phase 9 section of the audit.

### Phases 7–8

Background Replace and Reframe are wired into all four families (`engine/scene.mjs` + one
`redraw()` per family); Remove background prefers native BiRefNet. See the Phases 7–8 sections
of `WORKFLOW_RESEARCH.md` and `WORKFLOW_IMPLEMENTATION_AUDIT.md`.

## Not started

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
