# Workflow research

Research reports for every workflow added in the expansion (and corrections to existing ones).
Each report is written **before** the workflow is implemented and records: family, models,
LoRAs, control models, text encoder, VAE, custom nodes, the exact ComfyUI nodes with their
input/output types, the conditioning path, sampler / steps / CFG / denoise, limitations, VRAM
notes, sources, and whether the method is *officially documented*, *community-tested*,
*experimental* or *unsupported*.

Implementation status and test results live in
[WORKFLOW_IMPLEMENTATION_AUDIT.md](WORKFLOW_IMPLEMENTATION_AUDIT.md); the current per-family
capability table is [CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md).

## Method and evidence rules

1. **Upstream source code is the primary evidence** for node names, inputs, defaults and
   output types. Every node pack was cloned at a recorded commit and read (`INPUT_TYPES`,
   `RETURN_TYPES`, the node body where behaviour matters), then loaded into a real ComfyUI
   0.38.0 whose `/object_info` was captured (`tests/live-object-info.json`).
2. **Official workflows set the wiring and defaults**: Comfy-Org templates (the
   `comfyui-workflow-templates` 0.11.74 package that ships with ComfyUI) and the workflows
   model authors ship in their own repositories.
3. **Model cards and community reports** are secondary evidence. From this research
   environment `huggingface.co`, Civitai and most web pages were blocked by the network
   policy, so model-card statements were taken from search-engine extracts of those pages and
   are marked *(card, via search)*; anything that could not be confirmed from source code or an
   official workflow is labelled as such.
4. **Compatibility is never inferred from names.** A workflow is only built for a family when
   a model trained for that family and a node that applies it were found.
5. Not sufficiently verified → **RESEARCH_ONLY**: documented here, not offered in the UI.

Status of the method itself:

| Label | Meaning |
|---|---|
| Official | Comfy-Org template, ComfyUI core node, or the model author's own documented workflow |
| Community | A community model / node pack used exactly as its author documents |
| Composed | Wire Studio's own combination of documented nodes (each step documented, the combination not) |
| Experimental | Plausible and graph-valid, results not established — offered with an *Experimental* badge |
| Unsupported | No model or method exists for the family |

## Sources index

| Source | What it settled |
|---|---|
| ComfyUI `comfy_execution/validation.py`, `execution.py` (commit `2472a20`) | Link type rules mirrored by `finalize()` |
| ComfyUI `comfy_extras/nodes_sam3.py`, `nodes_bg_removal.py`, `nodes_mask.py` | Native SAM 3 detection (text and point prompts), native BiRefNet background removal, mask nodes |
| Comfy-Org templates `utility_birefnet_remove_background`, `utility_image_segment_sam3`, `utility_depth_anything3_image_depth_estimation`, `utility_sdpose_ood_image_to_pose`, `image_z_image_turbo_fun_union_controlnet`, `image_krea2_*`, `image_anima_*` | Official wiring, file names and download URLs |
| [lbouaraba/comfyui-krea2edit](https://github.com/lbouaraba/comfyui-krea2edit) `86f886d` — `__init__.py`, `README.md`, `CHANGELOG.md`, `workflows/krea2_identity_edit.json` | Krea 2 Identity Edit nodes, inputs, two-reference order, ref_boost, fit geometry, sampling defaults, v1.2 capabilities |
| [ostris/ComfyUI-Krea2-Ostris-Edit](https://github.com/ostris/ComfyUI-Krea2-Ostris-Edit) `7756566` — `nodes.py`, `workflow/Krea2_Ostris_Edit.json` | The ai-toolkit edit-LoRA conditioning path used by the public Krea 2 pose LoRA |
| [facok/comfyui-krea2-controlnet](https://github.com/facok/comfyui-krea2-controlnet) `79ebfd3` | Krea 2 Control-LoRA (channel-concat) nodes and recommended encode settings |
| [s-adhit/krea2-pose-controlnet](https://github.com/s-adhit/krea2-pose-controlnet) `daaf2e6` | A pose Control-LoRA with standalone Python inference only (no ComfyUI integration) |
| [cubiq/ComfyUI_IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus) `a0f451a` — `IPAdapterPlus.py`, `README.md` | IPAdapter nodes, SDXL style (block 6) / composition (block 3) weighting, model files |
| [cubiq/ComfyUI_InstantID](https://github.com/cubiq/ComfyUI_InstantID) `72495e8` — `README.md`, `examples/*.json` | InstantID nodes, files, CFG / noise advice, extra-ControlNet pattern |
| [cubiq/PuLID_ComfyUI](https://github.com/cubiq/PuLID_ComfyUI) `93e0c4c` | PuLID SDXL nodes (research only) |
| [1038lab/ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) `229529e` | Text-prompted SAM 3 segmentation and clothing / face / body segmenters |
| [Fannovel16/comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) `0cd2904` | Preprocessor node names and inputs |
