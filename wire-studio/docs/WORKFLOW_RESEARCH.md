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

---

## Phase 1 — Anima LLLite control and controlled Img2Img

**Family:** Anima only. **Architecture:** Anima (Cosmos-Predict2 DiT, 2B) with kohya-ss
ControlNet-LLLite patches applied to the model (`AnimaLLLiteApply`, ComfyUI core,
`comfy_extras/nodes_model_patch.py`, added by Comfy-Org/ComfyUI PR #14954). LLLite does **not**
use ControlNet conditioning: it patches the model, so it composes with any latent start
(empty latent or an encoded image).

| Item | Finding | Source |
|---|---|---|
| Diffusion model | `anima-base-v1.0.safetensors` (`UNETLoader`, `diffusion_models/`) | official templates |
| Text encoder | `qwen_3_06b_base.safetensors`, `CLIPLoader` type `stable_diffusion` | official templates |
| VAE | `qwen_image_vae.safetensors` | official templates |
| LoRAs | model-only (`LoraLoaderModelOnly`); optional official Turbo LoRA (8 steps, CFG 1) | official templates (`ComfySwitchNode` Turbo switch) |
| Control node | `ModelPatchLoader(name)` → `AnimaLLLiteApply(model, model_patch, image, strength, start_percent, end_percent, mask?)` → `MODEL` | live `/object_info`; templates |
| Sampling | KSampler 30 steps · CFG 4 · euler / simple (Turbo: 8 · 1) | templates |
| Patch defaults | strength 1, start 0, end 1 | templates |

**Current patches** *(card, via search: kohya-ss/Anima-LLLite README)*:

| Patch | Trained on | Input convention | Use |
|---|---|---|---|
| `anima-lllite-inpainting-v2` | Anima Base v1.0 | RGB + mask | inpaint / outpaint (existing) |
| `anima-lllite-any-test-like-v2` | Anima Base v1.0 | mixed **line art, scribble and grayscale**, heavily augmented; lines black on white | line art, canny, scribble, **grayscale** (new) |
| `anima-lllite-lineart-1` | Preview3 (legacy) | white background, black lines | line art fallback |
| `anima-lllite-scribble-1` | Preview3 (legacy) | fake scribble (HED / PiDiNet) | scribble fallback |
| `anima-lllite-depth-1` | Preview3 (legacy) | white = near, Depth Anything V2 | depth (only depth patch) |
| `anima-lllite-pose-1` | Preview3 (legacy) | DWPose colored skeleton + face / hands | pose (only pose patch; loose) |
| `anima-lllite-any-test-like-1-step*`, `inpainting-v1` | Preview3 (legacy) | — | superseded by the v2 files |

**Preprocessors.** The official any-control template uses core `Canny(0.17, 0.45)` →
`ImageInvert`; the official depth template uses **native Depth Anything 3**
(`LoadDA3Model` → `DA3Inference(504, upper_bound_resize, mono)` → `DA3Render(output=depth,
normalization=v2_style)`, model `geometry_estimation/depth_anything_3_mono_large.safetensors`),
whose `v2_style` normalisation matches the Depth Anything V2 maps the depth patch was trained on.
ComfyUI core has no line-art, scribble, HED, M-LSD or grayscale preprocessor (checked: core node
list and `blueprints/`); those stay on `comfyui_controlnet_aux` (`LineArtPreprocessor`,
`FakeScribblePreprocessor` / `PiDiNetPreprocessor` / `HEDPreprocessor`,
`ImageLuminanceDetector` — the sd-webui-controlnet "recolor / luminance" map — for grayscale).
Native pose (SDPose) loads its model through `CheckpointLoaderSimple`, which the family guard
reserves for SDXL, so in-graph pose maps keep using DWPose; native SDPose is offered by the
Control Map tool (Phase 9), whose maps can be uploaded as ready maps.

DA3's `mode` / `output` inputs are *dynamic combos* (`COMFY_DYNAMICCOMBO_V3`): in API format the
chosen option's inputs are sent as `output.normalization`, `output.apply_sky_clip`. The engine's
conform step now expands them like ComfyUI (`_io.py` DynamicCombo).

**Patch choice order** (fixes a latent defect: the old regex picked the *first installed file
alphabetically*, so `any-test-like-1-step1000` beat `any-test-like-v2`): line art / canny →
any-test-like-v2, lineart-1, any-test-like-1; scribble → any-test-like-v2, scribble-1,
any-test-like-1; grayscale → any-test-like-v2 only; depth → depth-1; pose → pose-1. An advanced
*Control patch* select lets you force any installed Anima control patch.

**Controlled Img2Img** (*composed*): `VAEEncode(source)` as the latent with `denoise` < 1, plus
the LLLite patch fed with a map made from the source (or from a separate control image).
Each step is documented (img2img = existing, run on a GPU; LLLite = official); the combination
is graph-validated only. Defaults: change strength 0.6, control strength 0.8, release at 1.0.
Pose keeps the *Weak control* limitation of the legacy pose patch.

**Status:** line art, canny, scribble, depth → READY (official patches / templates);
grayscale → READY (documented mode of any-test-like-v2); pose → PARTIAL (legacy patch);
Img2Img + Control → READY † (composed). **VRAM:** not measured here (no GPU); an LLLite patch is
small next to the 2B model, and the map preprocessors load their own models once.

---

## Phase 2 — Z-Image Fun ControlNet Union 2.1 (2602), combined control, Lite

**Family:** Z-Image only (Turbo; Base works with the same patch at Base settings).
**Architecture:** alibaba-pai *Fun ControlNet* — control layers injected into the Z-Image DiT via
a model patch: `ModelPatchLoader(name)` → `ZImageFunControlnet(model, model_patch, vae, strength,
image?, inpaint_image?, mask?, start_percent, end_percent)` → `MODEL`, applied **before**
`ModelSamplingAuraFlow` (official template order).

| Item | Finding | Source |
|---|---|---|
| Node | `ZImageFunControlnet` is a subclass of `QwenImageDiffsynthControlnet` (same function) that adds the optional `inpaint_image`; the older node has no inpaint input. Official blueprints still use the older name for plain control. | `comfy_extras/nodes_model_patch.py` |
| Patch detection | `ModelPatchLoader` recognises Fun ControlNets by `control_all_x_embedder.2-1.weight`: 15 control layers + 17 extra input channels = **2.1 full**; 3 layers + 17 = **2.1 lite**; otherwise **1.0** (no inpaint channels). A release with zeroed `control_noise_refiner` weights is flagged `broken`. | same |
| Control + inpaint | With a 2.x patch, `image` (control map), `inpaint_image` and `mask` are encoded **together** (`ZImageControlPatch.encode_latent_cond`; the control map and the inpaint image must have the same size). Control + Inpaint / Outpaint is therefore one native call, not a composition. | same |
| Mask convention | the node inverts the mask internally (`mask = 1 - mask`); pass ComfyUI's usual white = regenerate | same |
| Sampling | Turbo 8 steps, CFG 1, res_multistep / simple, AuraFlow shift 3 (template); 8-step distilled patches ("…-8steps") | templates, file names |
| Control strength | `control_context_scale` 0.65–0.90 for 2.x; larger scales want more steps; lite tolerates larger scales and gives softer control; inpaint mode wants a larger scale | *(card, via search)* |

**Patch versions and modes** *(card, via search: alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1)*:

| File | Size | Modes | Inpaint |
|---|---|---|---|
| `Z-Image-Turbo-Fun-Controlnet-Union.safetensors` (1.0) | — | canny, HED, depth, pose, M-LSD (official template note) | no |
| `…-Union-2.1-2601-8steps.safetensors` | 6.7 GB | + **scribble** | yes |
| `…-Union-2.1-lite-2601-8steps.safetensors` | 2.0 GB | as 2601, fewer layers (low VRAM, softer) | yes |
| `…-Union-2.1-2602-8steps.safetensors` | 6.7 GB | + **gray** | yes |
| `…-Union-2.1-lite-2602-8steps.safetensors` | 2.0 GB | as 2602, fewer layers | yes |

Version and lite/full are read from the **file name**: ComfyUI's `/object_info` exposes no file
metadata or hashes, so nothing stronger is available remotely (recorded as a limitation).

**Decisions.**
- Modes are offered per installed patch (runtime features): scribble needs a 2.x patch, gray a
  2602 patch; *Advanced → Control model* lists the installed Union patches so a **Lite** file can be
  chosen for low VRAM (one workflow, no duplicated logic). Automatic picks the newest full patch
  that supports the chosen mode, then lite, then 1.0. Tile patches are never used as Union.
- Scribble maps: FakeScribble (white lines on black, as for every Union model); gray: the
  luminance map (`ImageLuminanceDetector`).
- **Img2Img + Control** (composed): encoded source + Fun control, denoise 0.6. *Restyle* is the
  same task at a high change strength (0.85–0.95) — not a separate task.
- **Inpaint / Outpaint + Control**: optional structure guide passed as `image` next to
  `inpaint_image` + `mask` (2.x only). For inpaint the map is made from the source (or a separate
  control image) at the source size; for outpaint only a separate control image of the whole new
  canvas makes sense.
- **Tile restore / super-resolution → RESEARCH_ONLY.** A `Z-Image-Turbo-Fun-Controlnet-Tile-2.1`
  model exists (trained up to 2048², 8 steps, lite variant) *(card, via search)*, but neither an
  official ComfyUI template nor a documented input preparation (tiling, control image, denoise)
  could be verified. The official 2K upscaler template (`utility_z_image_turbo_2k_upscaler`) does
  **not** use it (model ×4 → ×0.5 → 5 steps, dpmpp_2m_sde / beta, denoise 0.33) — that is what the
  existing Upscale follows.

**Status:** canny / HED / depth / pose / M-LSD READY †; scribble READY † (2.x); gray READY †
(2602); Lite as a model choice READY †; Img2Img + Control, Inpaint + Control, Outpaint + Control
READY † (native combined call / composed img2img); Tile RESEARCH_ONLY.
**VRAM:** not measured here; the card positions lite (2.0 GB) for lower-VRAM machines vs 6.7 GB.
