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
| [s-adhit/krea2-pose-controlnet](https://github.com/s-adhit/krea2-pose-controlnet) `daaf2e6` — `comfyui/README.md`, `comfyui/krea2_pose_control/` | A pose Control-LoRA whose ComfyUI package is self-contained (own runtime and model loading) — research only, see Phases 4–6 |
| [cicalooo/ComfyUI-Krea2-UniDepth](https://github.com/cicalooo/ComfyUI-Krea2-UniDepth) `2641b08` — `nodes.py`, `conditioning.py`, `geometry.py`, `README.md`, `VALIDATION.md`, `workflows/*.json` | UniDepth depth + reference conditioning on Krea 2's native reference path, its inputs and validation record |
| thedeoxen/Krea-2-pose-controlnet (Hugging Face; read through the GitHub mirror [bencoster/Krea-2-pose-controlnet](https://github.com/bencoster/Krea-2-pose-controlnet)) — `README.md`, `krea2_controlnet_pose.json` | The Krea 2 OpenPose Control-LoRA, its settings and its published ComfyUI workflow |
| ComfyUI 0.38.0 `comfy/ldm/krea2/model.py`, `node_helpers.py` | How Krea 2 consumes reference latents; that conditioning values replace (not append) by default |
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

---

## Phase 3 — Krea 2 Identity Edit Suite

**Family:** Krea 2 only (Turbo or RAW). **Architecture:** the community *Krea 2 Identity Edit*
LoRA (`krea2_identity_edit_v1_2.safetensors`, an ai-toolkit fine-tune of Krea 2 RAW by
conradlocke) with its node pack **comfyui-krea2edit v1.2.5** (`86f886d`). Dual conditioning,
"matching how the LoRA was trained" (README):

1. *Appearance path* — `Krea2EditModelPatch(model, source_latent, source_latent_b?, ref_boost,
   ref_boost_a, fit_mode, ref_boost_mask?, vae, source_image, source_image_b?, target_latent)` →
   `MODEL`. It wraps the DiT forward so the VAE-encoded source(s) are prepended as clean tokens
   (RoPE frame 1, 2; target frame 0). With `vae` + `source_image` (the "pixel path", required for
   `fit`) the node re-encodes **only** `source_image` / `source_image_b` at the target size — so a
   second reference must arrive as `source_image_b` (Phase 0 finding #1).
2. *Semantic path* — `Krea2EditGroundedEncode(clip, prompt, image?, image_b?, grounding_px,
   system_prompt?)` → `CONDITIONING`: Qwen3-VL reads the instruction **while seeing** the image(s).
   At CFG > 1 the negative is a second grounded encode with an **empty** prompt and the same
   images (the trained unconditional).

| Setting | Author's guidance | Source |
|---|---|---|
| LoRA | `LoraLoaderModelOnly(krea2_identity_edit_v1_2, 1.0)` on the Krea 2 UNet, before the patch | README, workflow |
| Turbo | 10 steps, CFG 1, euler / simple (8 = more adherence, 12 = more face detail) | workflow note |
| RAW | 40 steps, CFG 3–4 (negative matters); **removals**: RAW, CFG 3, ~20 steps — Turbo at CFG 1 "will usually re-render the subject instead of removing it" | workflow note, README |
| `ref_boost` | 1 = v1.1 behaviour; **4 = recommended** ("much stronger face + body likeness, more reliable edits"); > 10 "over-copy: removals / replacements start failing"; < 1 suppresses the reference ("creative freedom"). Applies to the **last** reference; `ref_boost_a` to the first in two-reference edits | workflow note, node tooltips |
| `ref_boost_mask` | "optional region on the (last) reference to boost, e.g. the face" | node tooltip, `_ref_attn_bias` |
| `grounding_px` | trained 384–768; 1024 for people (likeness), 512 for stubborn scene changes; lower it if compositions double | README, workflow |
| Geometry | `fit_mode: fit` + pixel path handles mismatched aspect ratios; wire `target_latent` = the sampler latent; ≤ 2 MP (1 MP sweet spot; two people ≤ 1.5 MP) | README |
| Two references | order is fixed: **image 1 = the scene / the image being edited, image 2 = the person (subject)**; swapping "sharply degrades results"; place two people in one pass | README, workflow, *(card, via search)* |
| Sampler | prefer euler (ODE) over er_sde for outpainting | CHANGELOG 1.2.4 |
| v1.2 capabilities | better likeness, character sheets (use and create), head / face / eye / person swap (stablellama MIT dataset), outpainting, inpainting, try-on, better person removal, 1024 pass | CHANGELOG |
| Phrasing | plain English imperatives ("Change her outfit to a red raincoat.", "Place this person at the cafe table, holding a coffee.", "Relight the scene with warm golden hour sunlight."); face swap: "A seamless face swap. Replace only the facial features of the subject in the input image with the identity from image_b." | workflow note, *(card, via search)* |
| Not documented | the exact instruction / input format the v1.2 inpainting and outpainting were trained on; try-on reference order beyond the general rule | — |

**What genuinely differs between the 19 tasks** (so none is an alias of another):

| Task | References (image 1 · image 2) | Mask | Instruction | Geometry | Defaults (ref_boost · grounding) | Extra topology |
|---|---|---|---|---|---|---|
| Smart Edit | edited image · optional person | — | free | from image 1 | 4 · 768 | — |
| Object Remove | edited image | optional locality mask | "Remove the …" | from image 1 | 1 · 512 | RAW preset (CFG 3, 20 steps); paste-back inside the mask |
| Object Replace | edited image · optional object photo | optional | "Replace the … with …" / "…with the object from image 2" | from image 1 | 2 · 768 | paste-back |
| Background Swap | (text) photo · — / (image) **new background · subject** | — | "Change the background to …" / "Place this person in this scene…" | from the subject photo | 4 · 768 | reference order flips with a background image |
| Person Replace | scene · optional new person | optional | "Replace the … with …" / "…with the person from image 2" | from image 1 | 4 · 1024 | paste-back |
| Insert Person | scene · person | — | "Place this person …" | from the scene | 4 (person) / 1 (scene) · 768 | — |
| Face Replace | target photo · identity photo | optional | documented face-swap sentence | from image 1 | 4 · 1024 | **face-focused boost**: `ref_boost_mask` from a face detector on image 2 (Impact); paste-back |
| Head Replace | target · identity | optional | face-swap sentence adapted to the whole head + hair | from image 1 | 4 · 1024 | face-focused boost (larger dilation); paste-back |
| Eye Replace | target · optional eyes reference | optional | "Replace only the eyes …" / "Change the eyes to …" | from image 1 | 3 · 1024 | paste-back |
| Outfit Change | person | — | "Change their outfit to …" (+ layering words) | from image 1 | 4 · 1024 | — |
| Virtual Try-On | person · garment | — | "Dress the person in the garment from image 2 …" | from the person | 3 (garment) / 1 (person) · 1024 | — |
| Identity Inpaint | edited image | **required** | free | from image 1 | 2 · 768 | **masked latent**: encoded image + noise mask + differential diffusion; paste-back |
| Identity Outpaint | padded, pre-filled canvas | new area | "Extend the picture outward …" + description | padded canvas | 1 · 768 | masked latent on the padded canvas; euler |
| Identity Reframe | as outpaint | new area | as outpaint | **computed from a target aspect + alignment** | 1 · 768 | shared reframe calculator (Phase 8) |
| Character Variation | character | — | "Create a variation of this character …" | free size | **0.3–1 (below 1 frees it)** · 768 | batch of variations |
| Character Restage | character | — | "Create a photo of this person …" | free size | 4 · 1024 | — |
| Character Sheet | character | — | reference-sheet sentence (views, plain background) | wide (3:2) | 4 · 1024 | — |
| Scene Change | edited image | — | free scene / lighting change, people kept | from image 1 | 2 · 512 | — |
| Pose Restage | **pose reference · character** | — | "Make this person take the pose …" / text pose | free size | 4 · 1024 | reference order puts the pose scene first |

**Statuses.** Documented by the LoRA author → READY † (Smart Edit, Object Remove, Object Replace,
Insert Person, Outfit Change, Character Restage, Character Sheet, Face / Head / Eye / Person Replace,
Try-On, Scene Change, Background Swap by text). EXPERIMENTAL † — the method is Wire Studio's:
Identity Inpaint / Outpaint / Reframe (the v1.2 training format for in/outpainting is not
documented; the masked-latent composition guarantees untouched pixels), Pose Restage with a pose
image (reference order inferred from the scene-first rule), Character Variation (ref_boost < 1 is
documented as "creative freedom", the task is composed), Background Swap with a background image
(order inferred). The face-focused boost uses the documented `ref_boost_mask` input with a face
detector mask (Impact Subpack), skipped with a note when Impact is not installed.

**Safety and scope.** The LoRA author states it is SFW-only and asks that it not be used for
non-consensual imagery or deepfakes of real people; Wire Studio shows this notice on the face,
head, eye and person replacement tasks.

**VRAM:** not measured here; the README explains the pixel path's VRAM interaction and why
`target_latent` must be wired (every Wire Studio edit graph wires it).

---

## Phases 4–6 — Krea 2 Style Reference, advanced Depth, real Pose

**Family:** Krea 2 only. The question for each requested combination was not "can a graph be
wired" but "does each mechanism still see what it was trained on when combined". That depends
on how each implementation feeds the model, so the node code was read first.

### How each mechanism reaches the model

| Mechanism | How it conditions Krea 2 | Source |
|---|---|---|
| Native reference latents (core) | `_forward` concatenates the reference tokens to the image tokens, **then** runs the input projection `self.first` on the whole sequence; `index_timestep_zero` gives the references t = 0 | ComfyUI 0.38.0 `comfy/ldm/krea2/model.py` `_forward` |
| Style reference (official) | `krea2_style_reference` LoRA; `TextEncodeQwenImageEditPlus` adds the images as vision tokens ("Picture N") **and** as `reference_latents` → `FluxKontextMultiReferenceLatentMethod(index_timestep_zero)`; `ModelSamplingFlux(1.15, 0.5, w, h)`, 8 steps, CFG 1, euler / simple | Comfy-Org template `image_krea2_turbo_int8_image_style_reference` |
| Depth Control-LoRA (facok + Patil) | replaces `first` with `Krea2ControlInputProjection`, which adds the control tokens to the image tokens and **requires the same token count** — otherwise `RuntimeError("Krea2 control token count mismatch")`. No start / end inputs | `comfyui-krea2-controlnet` `79ebfd3` `nodes.py` `forward` |
| UniDepth (cicalooo) | `Krea2UniDepthConditioning` VAE-encodes the depth map (+ optional `image`, + a `references` stack) at the target geometry and sets them as `reference_latents` with `index_timestep_zero`. It uses `conditioning_set_values` **without append**, so references already on the conditioning are **replaced**. `start_percent` / `end_percent` set **one** window for the whole reference list | `ComfyUI-Krea2-UniDepth` `2641b08` `conditioning.py`, `nodes.py`; ComfyUI `node_helpers.py` |
| Identity Edit (krea2edit) | a diffusion-model wrapper: "ref_latents are ignored (this patch supplies its own source path)"; it runs `m.first` separately on the target and on each source | `comfyui-krea2edit` `86f886d` `__init__.py` L336–343, L211–213 |
| Ostris Edit (ai-toolkit edit LoRAs) | `TextEncodeKrea2OstrisEdit` writes "Picture N" vision tokens and (with a VAE) `reference_latents`; `Krea2OstrisEditModelPatch` replaces the forward so references are appended at t = 0; `kv_cache` reuses their K/V | `ComfyUI-Krea2-Ostris-Edit` `7756566` `nodes.py`, `README.md` |

### Phase 4 — Style Reference

| Combination | Status | Why |
|---|---|---|
| Style Reference (+ prompt) | READY † (Official) | The official template, now its own task (up to three references, as `TextEncodeQwenImageEditPlus` takes `image1..3`); Text to Image keeps its optional style fields for saved settings |
| Style + Img2Img | EXPERIMENTAL † (Composed) | Same conditioning; the sampler starts from the VAE-encoded source at a chosen strength, and the Flux shift is computed for the source size. Each step is documented; the combination is not |
| Style + Identity | UNSUPPORTED | The Identity Edit wrapper ignores `reference_latents`, so the style images would be silently dropped (only their vision tokens would remain) |
| Style + Depth | RESEARCH_ONLY | Control-LoRA: the style reference tokens enter `first` with the image tokens → token-count mismatch (a hard error). UniDepth: its conditioning replaces the style `reference_latents`. Stacking the style image into UniDepth's reference list would put it behind the depth map as reference 2, a layout neither LoRA was trained on; no tested workflow exists |
| Style + Pose | RESEARCH_ONLY | Both LoRAs expect their own image as reference 1 ("Picture 1"); no tested combination |

### Phase 5 — advanced Depth

Two public implementations exist and are **not interchangeable** (different LoRAs, different
mechanisms): Patil's depth Control-LoRA through comfyui-krea2-controlnet (already used), and the
UniDepth functional LoRA (`krea2_unidepth_depth_exp_v1.safetensors`, `cicalooo/krea2_unidepth_depth`,
placed in `loras/krea2/`) through ComfyUI-Krea2-UniDepth (requires ComfyUI ≥ 0.29.2). Wire Studio
offers UniDepth as a *Depth method* only when its nodes **and** LoRA are installed, uses it on its
own when it is the only one installed, and never passes one implementation's LoRA to the other's
loader (the safety check refuses it).

Options, as verified against the installed node (`/object_info` of the real pack):

| Requested option | Offered as | Status | Notes |
|---|---|---|---|
| Depth + prompt | ControlNet → Depth (either method) | READY † (Control-LoRA) / EXPERIMENTAL † (UniDepth) | UniDepth's own validation record states that no full-size sample was rendered; image-quality presets "still require fixed-seed A/B renders" |
| Depth + source image | Img2Img + Control → Depth | EXPERIMENTAL † (Composed) | Control-LoRA: the control latent is sized from the encoded source (`Krea2ControlImageEncode.latent`); UniDepth: the encoded source is its `target_latent` (which sets the geometry), then partial denoise |
| Depth + reference images | ControlNet → Depth → UniDepth: *Reference image*, *Second reference* | EXPERIMENTAL † | The pack's documented `image` input and its `Reference Stack` (appended after the depth map, center-crop / letterbox / stretch fit) |
| Multiple references | the same, two images | EXPERIMENTAL † | The stack is chainable; two are offered in the form |
| Independent ranges | *Guide from / until* (UniDepth) | EXPERIMENTAL † | One window for the depth map **and** its references together — per-reference windows are not possible because they share one conditioning entry. The Control-LoRA nodes have no range at all |
| Calibration | *Calibrate depth map* + gamma (UniDepth) | EXPERIMENTAL † | The pack's built-in 1–99 % percentile clipping and gamma; smoothing, polarity and per-section LoRA strengths are left at the pack's baseline ("all controls at 1.0 … the correct baseline before tuning") |
| Depth + style | — | RESEARCH_ONLY | See Phase 4 |
| Depth + identity | — | UNSUPPORTED | UniDepth's depth map would be ignored by the Identity Edit wrapper; with the Control-LoRA the wrapper runs `first` on every source too, so the depth would be added to the sources (same size) or fail with a token-count mismatch (other sizes) |
| Depth-guided outpaint | Outpaint → *Guide: Depth of the extended picture* | EXPERIMENTAL † (Composed) | The depth of the pre-filled padded canvas through the Control-LoRA; its control latent is the padded, noise-masked latent, so sizes always match. Original pixels are still pasted back. UniDepth's own "prompt-led depth outpainting" (LoRA 0.9, letterbox padding) is described by its author as "empirical rather than registered or mask-aware" and is not used |
| Depth-guided reframe | comes with Reframe (Phase 8), which reuses outpaint | — | — |

### Phase 6 — real Pose

The public **Krea 2 OpenPose Control-LoRA** (thedeoxen, Apache-2.0, base Krea-2-Turbo,
`krea2_turbo_openpose_controlnet.safetensors`, 228,587,504 bytes per its LFS pointer) is an
ai-toolkit edit-style LoRA run through the Ostris Edit nodes. From its README and its published
workflow `krea2_controlnet_pose.json`:

- `UNETLoader` → `Krea2OstrisEditModelPatch(kv_cache = true)` → `LoraLoaderModelOnly(1.0)` →
  `KSampler(10 steps, CFG 1, euler, simple)`;
- `DWPreprocessor` (body, hands and face on) → `FluxKontextImageScale` →
  `TextEncodeKrea2OstrisEdit(prompt, vae, image1 = pose map)` →
  `FluxKontextMultiReferenceLatentMethod(index_timestep_zero)`, and the same with an empty prompt
  for the negative; `EmptyLatentImage` sized from the scaled pose map;
- "pass the pose map as image 1", weight 0.8–1.0 (0.6–0.8 if the pose is too rigid), DWPose maps on
  a black background work best, "no special trigger phrase", "primarily trained on humans, but
  also works with stylized characters", and explicitly **"not a reference + pose fusion model"**.

Wire Studio's Pose task follows that graph. One deliberate difference: the map is fitted to the
size you choose (by default the reference's aspect) instead of setting the output size from the
map, so skeleton and canvas always match. The Ostris README says `kv_cache` is for LoRAs trained
with it; the LoRA author's own workflow turns it on, so Wire Studio does too (an advanced switch).

| Combination | Status | Why |
|---|---|---|
| Pose → Image | EXPERIMENTAL † (Community) | The author's workflow; graph validated, not run on a GPU here |
| Pose + source image | EXPERIMENTAL † (Composed) | The same conditioning with a partially denoised start image |
| Pose + identity | EXPERIMENTAL † | Pose Restage (Identity Edit, Phase 3) — the identity LoRA reads the pose photo as image 1 |
| Pose + style, Pose + identity + style | RESEARCH_ONLY | No pose+reference fusion model exists (the author says this LoRA is not one), and the identity wrapper ignores other references |

**Retired:** the previous Krea 2 *Pose* task copied the pose through a depth map (silhouette
transfer, no pose model). The Pose task now uses only the pose model; depth-based silhouette
transfer remains available as ControlNet → Depth. Saved Pose settings keep working: the old
*Image is already a depth map* switch is no longer read by Pose (a new *pose skeleton* switch
replaces it), so an old saved depth map is not mistaken for a skeleton.

**RESEARCH_ONLY — s-adhit/krea2-pose-controlnet.** Its ComfyUI package is self-contained: the
`Krea2PoseGenerate` node vendors its own Krea 2 runtime and Turbo sampler, loads the model from
absolute paths (`models/krea2/…`) and downloads Qwen3-VL-4B-Instruct and the Qwen Image VAE on
first use, with CFG fixed internally. It bypasses ComfyUI's loaders and model management (a second
copy of Krea 2 and the text encoder next to the ones Wire Studio loads) and accepts only its own
frozen "PoseBridge" COCO-17 rendering ("Do not pass a generic OpenPose or native DWPose condition
raster"). It cannot be built from the installed loaders, so it is not offered.

**VRAM:** not measured here (no GPU in the research environment). UniDepth recommends FP8 Krea 2
weights and names native INT8 as the supported minimum for its depth and edit functions.

---

## Phases 7–8 — Background Replace and Reframe (every family)

**Families:** all four, each with its own models. The orchestration (`engine/scene.mjs`) is
family-free and only hands masks and padded canvases to the family's existing inpaint and
outpaint graphs, so `assertFamily()` still checks every graph and no family's nodes are shared.

### Subject mask

| Source | Finding |
|---|---|
| Comfy-Org template `utility_birefnet_remove_background` (templates package shipped with ComfyUI 0.38.0) | `LoadBackgroundRemovalModel(birefnet.safetensors)` → `RemoveBackground(image)` → `MASK`; the template inverts it (`InvertMask`) before `JoinImageWithAlpha`. Model: `Comfy-Org/BiRefNet` → `background_removal/birefnet.safetensors` (423.9 MB) in `models/background_removal/` |
| ComfyUI `comfy_extras/nodes_bg_removal.py` | `RemoveBackground` "Generates a foreground mask" (subject = 1); the model list is the `background_removal` folder |
| ComfyUI `node_helpers` / core mask nodes (`/object_info`) | `InvertMask`, `GrowMask(expand, tapered_corners)`, `MaskComposite(…, operation: subtract)`, `ImageBlur(blur_radius ≤ 31, sigma ≤ 10)` |
| ComfyUI-RMBG `229529e` | `BiRefNetRMBG` / `RMBG` return `IMAGE, MASK, IMAGE`; output 1 is the foreground mask — used when the native model is not installed |

Wire Studio prefers the native, official path when `birefnet.safetensors` is installed and falls
back to ComfyUI-RMBG. The family-free *Remove background* tool now does the same (the template's
`InvertMask → JoinImageWithAlpha`).

### Background Replace

There is no official background-replacement template for these families; the method is Wire
Studio's composition of documented steps, so every mode is **EXPERIMENTAL †**:

| Mode | Graph | Why this way |
|---|---|---|
| Describe a new background | background mask = `InvertMask(subject)`, tightened with `GrowMask(+4 px)` against halos → the family's own inpaint (Anima LLLite inpainting v2, SDXL Union ProMax repaint, Z-Image Fun Union 2.x inpaint, Krea 2 differential diffusion) on that mask → subject pasted back through a feathered copy of the mask | Only the background is sampled; the subject's pixels are never redrawn |
| Use a background photo | the photo scaled / center-cropped to the subject photo's size and composited behind the subject; then an **edge band** (`GrowMask(+r)` minus `GrowMask(−r)` of the background mask) is redrawn by the family at low strength (0.35) and blended back | Compositing alone leaves a cut-out edge; a thin, gentle redraw blends light and colour at the outline only |
| Blur the background | `ImageBlur` of the photo composited outside the subject; optional edge band as above (without it, no model runs at all) | — |

The "generated / supplied / prompt" backgrounds of the plan map to *Describe* (generated from the
prompt by the family's inpaint), *Use a background photo* (supplied) and the optional *Scene*
prompt that steers the edge blend. Mask expansion, feathering and edge cleanup are the three
mask controls the plan asked for.

### Reframe

Reframe computes how far to extend each side (`reframeEdges`, already used by Identity Reframe;
multiples of 8, never cropping) for a target **aspect ratio** or **exact size** and an
**alignment**, then runs the family's **own Outpaint** task with those edges, inheriting all of
its options (pre-fill, Z-Image guide image, Krea 2 depth guide). An exact size is reached by
extending to its aspect ratio and then scaling; an image already of that shape is only resized.
Status follows each family's Outpaint (READY † where Outpaint is READY, PARTIAL for Krea 2,
whose outpaint has no inpaint model).

**VRAM:** not measured (no GPU). BiRefNet runs at its own resolution; the inpaint / outpaint cost
is that of the family's existing task.

---

## Phases 10–12 — SDXL Image Reference, Identity Reference, Multi-Control

**Family:** SDXL only (IPAdapter and InstantID models are trained for SDXL; SD 1.5, FaceID and
Kolors IPAdapter files are never offered). Both packs are by cubiq and in "maintenance only" mode
since 2025-04-14; they load and validate on ComfyUI 0.38.0.

### Image Reference (ComfyUI_IPAdapter_plus `a0f451a`)

| Fact | Source |
|---|---|
| Models: `models/ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors` (Plus), `ip-adapter_sdxl_vit-h.safetensors`, `ip-adapter_sdxl.safetensors` (ViT-G, **needs the bigG encoder**), `ip_plus_composition_sdxl.safetensors` (community); encoders in `models/clip_vision/`: `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors`, `CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors` (download and rename) | `README.md` |
| Weight types: linear … `style transfer`, `composition`, `strong style transfer`, `style and composition`, `style transfer precise`, `composition precise` | `IPAdapterPlus.py` `WEIGHT_TYPES` |
| "lower the weight to at least 0.8" | `README.md` |
| Style + composition: `IPAdapterStyleComposition` 1.2 / 1, expand_style off, combine average | `examples/ipadapter_style_composition.json` |
| Precise style: `IPAdapterAdvanced(style transfer precise)` or `IPAdapterPreciseStyleTransfer`; precise composition: `IPAdapterPreciseComposition` 0.8, boost 0.35, `K+mean(V) w/ C penalty` | `examples/ipadapter_precise_*.json` |
| Tiled: `IPAdapterTiled` (whole non-square references) | `examples/ipadapter_tiled.json` |
| Area-limited references: `attn_mask`; regions: `IPAdapterRegionalConditioning` (example) | node inputs, `examples/ipadapter_regional_conditioning.json` |

Wire Studio picks Plus ViT-H, then ViT-H, then ViT-G (with bigG), and checks the matching encoder.
*Regional* uses two `IPAdapterAdvanced` with complementary `attn_mask`s (halves via
`SolidMask` + `MaskComposite`, or a painted area and its inverse) instead of the
RegionalConditioning chain, which in the example needs an extra pack (`MaskFromRGBCMYBW+`) —
**EXPERIMENTAL**. Starting from an image, inpainting with a reference, and references with
ControlNets are Wire Studio's combinations — **EXPERIMENTAL**.

### Identity Reference (ComfyUI_InstantID `72495e8`)

| Fact | Source |
|---|---|
| `models/instantid/ip-adapter.bin` + its ControlNet (`ControlNetModel/diffusion_pytorch_model.safetensors`) + InsightFace **antelopev2** in `models/insightface/models/antelopev2` | `README.md` |
| ApplyInstantID weight 0.8; 30 steps, CFG 4.5, ddpm / karras, 1016 × 1016 ("lower the CFG"; 1016 avoids watermarks) | `examples/InstantID_basic.json`, `README.md` |
| The basic node = advanced node with `ip_weight = cn_strength = weight`, noise 0.35, combine average | `InstantID.py` `apply_instantid` |
| Pose: `image_kps` from another photo | `examples/InstantID_posed.json` |
| Extra ControlNet after InstantID: depth 0.65, end 0.35 | `examples/InstantID_depth.json` |
| IPAdapter after InstantID for styling: 0.5, linear | `examples/InstantID_IPAdapter.json` |

The antelopev2 folder is not visible through `/object_info` (the face-analysis node only lists
providers), so Wire Studio names it in the task notes and the models guide but cannot check it.

**RESEARCH_ONLY:** PuLID (`PuLID_ComfyUI` `93e0c4c`) — `PulidEvaClipLoader` has no file input
and downloads EVA02-CLIP-L-14-336 at first use, and facexlib downloads its parsing models, outside
ComfyUI's model folders, so they cannot be detected or checked. IPAdapter FaceID — needs
insightface and a LoRA paired to each model file. InstantID covers SDXL identity with fixed,
detectable files.

### Multi-Control

Several `ControlNetApplyAdvanced` in a chain is ordinary ComfyUI usage; each has its own
strength and `start_percent` / `end_percent`. Wire Studio loads each ControlNet file once and gives
every Union control its own `SetUnionControlNetType`. Three controls (one plus two extra) is a UI
limit chosen without a GPU to measure VRAM — **EXPERIMENTAL**.

