# Workflow research and catalog

This is the research behind Wire Studio's workflows: for each model family, which workflow
works best for each task, what it needs, and where the decision comes from. The workflows
themselves live in code (`engine/families/*.mjs`) and as exported files (`../workflows/`).

**Ground rules**

1. **One family, one pipeline.** Every family has its own loaders, prompt style, sampling defaults
   and task builders in its own file. A safety check (`assertFamily` in `engine/index.mjs`)
   refuses any graph that loads another family's model, LoRA, text encoder, VAE, patch or
   ControlNet, so nothing is ever mixed.
2. **Prefer the official reference.** Comfy-Org's own templates
   ([workflow_templates](https://github.com/Comfy-Org/workflow_templates)) set loaders, node order
   and defaults. Community add-ons are used only where no official path exists, and are labelled.
3. **Honest availability.** If a family has no model that does a task well, the task is either
   marked *Experimental*/*Weak* with the reason, or not offered at all, instead of faking it with
   another family's model.
4. **Checked against your ComfyUI.** Before anything is queued, each graph is conformed to your
   live `/object_info` (missing defaults filled, unknown inputs dropped, combo values checked), and
   anything missing is reported with the pack or file to install.

---

## Families at a glance

| | Anima | SDXL | Z-Image | Krea 2 |
|---|---|---|---|---|
| What it is | CircleStone Labs × Comfy Org 2B anime/illustration model | SDXL 1.0 and fine-tunes (Illustrious, NoobAI, Pony…) | Tongyi-MAI 6B single-stream DiT (Turbo distilled + Base) | Krea's 12B DiT, open weights since June 2026 (Turbo + RAW) |
| Loaders | `UNETLoader` + `CLIPLoader` qwen_3_06b_base (`stable_diffusion`) + `VAELoader` qwen_image_vae | `CheckpointLoaderSimple` | `UNETLoader` + `CLIPLoader` qwen_3_4b (`lumina2`) + `VAELoader` ae | `UNETLoader` + `CLIPLoader` qwen3vl_4b (`krea2`) + `VAELoader` qwen_image_vae |
| LoRAs | `LoraLoaderModelOnly` | `LoraLoader` (model + CLIP) | `LoraLoaderModelOnly` | `LoraLoaderModelOnly` |
| Latent | `EmptyLatentImage` | `EmptyLatentImage` | `EmptySD3LatentImage` | `EmptyLatentImage` |
| Default sampling | 30 steps · CFG 4 · euler/simple (Turbo LoRA: 8 · 1) | 28 · 6 · euler_ancestral/normal | Turbo 8 · 1 · res_multistep/simple, shift 3 · Base 25 · 4 | Turbo 8 · 1 · euler/simple · RAW 52 · 4 |
| Negative prompt | real negative | real negative | `ConditioningZeroOut` at CFG 1, real negative above | `ConditioningZeroOut` at CFG 1, real negative above |
| Prompt style | tags (`masterpiece, best quality, score_7, …`) | tags (Illustrious/Pony) or short sentences | natural sentences | rich natural language |
| Control models | kohya **Anima-LLLite** patches | xinsir **ControlNet Union ProMax** / dedicated SDXL nets | **Fun ControlNet Union** (2.1 adds inpaint) | community **depth Control-LoRA** or **UniDepth**, **OpenPose LoRA** |

## Task matrix

| Task | Anima | SDXL | Z-Image | Krea 2 |
|---|---|---|---|---|
| Text to Image | ✓ (+ official Turbo LoRA) | ✓ | ✓ | ✓ (+ official style reference) |
| Style Reference | — | — | — | ✓ official (1–3 references); redraw an image in the style *experimental* |
| Image to Image | ✓ | ✓ | ✓ | ✓ |
| Smart Edit (instruction) | — | — | — | ✓ add-on (Identity Edit LoRA) + 18 dedicated edit tasks |
| Inpaint | ✓ LLLite inpaint v2 context | ✓ Union ProMax *repaint* context | ✓ Fun Union 2.x inpaint context | ✓ differential diffusion |
| Outpaint | ✓ | ✓ | ✓ | ✓ (+ depth guide, *experimental*) |
| Reframe (aspect / exact size) | ✓ via its Outpaint | ✓ via its Outpaint | ✓ via its Outpaint | ✓ via its Outpaint (+ depth guide) |
| Background Replace | *experimental*: BiRefNet subject mask + LLLite inpaint | *experimental*: + Union ProMax repaint | *experimental*: + Fun Union inpaint | *experimental*: + differential diffusion (also Background Swap in Identity Edit) |
| Face Fix (face / eyes / lips) | ✓ | ✓ | ✓ | ✓ |
| Hand Fix | ✓ | ✓ | ✓ | ✓ |
| Face Swap | **not offered** | ✓ ReActor + SDXL blend | ✓ ReActor + Z-Image blend | ✓ ReActor + Krea 2 blend |
| Pose | ✓ LLLite pose (*weak*) | ✓ OpenPose / Union | ✓ Fun Union pose | *experimental*, OpenPose Control-LoRA (+ optional start image) |
| ControlNet | line art · canny · scribble · grayscale · any · depth | canny · line art · scribble · depth · pose | canny · HED · depth · pose · M-LSD · scribble (2.1) · gray (2602) | depth (Control-LoRA, or UniDepth with reference images — *experimental*) |
| Img2Img + Control | line art · canny · scribble · grayscale · depth · pose (weak) | — | canny · HED · depth · pose · M-LSD · scribble · gray | depth (*experimental*) |
| Upscale (+ detail) | ✓ | ✓ | ✓ (official 2K upscaler settings) | ✓ |

---

## Anima

Reference templates: `image_anima_base_v1`, `image_anima_lllite_image_inpainting`,
`image_anima_lllite_any_control_to_image`, `image_anima_lllite_depth_control_to_image`.

**Files** (`models/…`): `diffusion_models/anima-base-v1.0.safetensors`,
`text_encoders/qwen_3_06b_base.safetensors`, `vae/qwen_image_vae.safetensors`; optional
`loras/anima-turbo-lora-v0.2.safetensors`; control patches in `model_patches/`
(`anima-lllite-inpainting-v2`, `anima-lllite-any-test-like-v2`, `anima-lllite-depth-1`,
`anima-lllite-pose-1`).

- **Generate**: UNET → LoRAs → KSampler 30 / CFG 4 / euler / simple, the official negative
  (`worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia`).
  *Turbo* switches on the official Turbo LoRA with 8 steps / CFG 1, as the template's switch does.
  Avoid the karras scheduler: Anima Studio's live tests produced near-black images with it.
- **Inpaint**: `ModelPatchLoader(anima-lllite-inpainting-v2)` → `AnimaLLLiteApply(image, mask)` →
  `VAEEncode` + `SetLatentNoiseMask` → KSampler → soft-edged paste-back. The official template
  regenerates the whole canvas; masked sampling plus paste-back keeps every unmasked pixel
  identical, and Anima Studio verified that the patch keeps the fill coherent at strength 1.
- **Outpaint**: `ImagePadForOutpaint` → Navier-Stokes pre-fill (`INPAINT_MaskedFill`, the cleanest
  seams in live tests) → the same LLLite path. The patch gets a *binary* mask (it was trained on
  binary masks); the feathered mask still drives noise and blending.
- **ControlNet**: `any-test-like-v2` (the Base v1.0 model, trained on line art / scribble /
  grayscale) for line art, canny, scribble, **grayscale** (a luminance map: tones and composition)
  and **Any** (your own drawing or grayscale image, used as it is). Line input is **black lines on
  white**, so generated line maps are inverted, exactly like the official template's
  `Canny → ImageInvert`. Depth uses `anima-lllite-depth-1` (white = near) with a **native Depth
  Anything 3** map (`v2_style`, as the official depth template) when its model is installed,
  else comfyui_controlnet_aux's Depth Anything V2. Patch choice follows an explicit order
  (v2 first, then the legacy `lineart-1` / `scribble-1`), and *Advanced → Control patch* can force
  any installed Anima control patch.
- **Img2Img + Control**: the source is encoded (`denoise` 0.6 by default) and an LLLite patch,
  fed a map of the same source (or of a separate control image / ready map), keeps its structure:
  line art, canny, scribble, grayscale, depth, or pose (weak, legacy patch).
- **Pose**: `anima-lllite-pose-1` with a DWPose map. The model card says this pose model guides
  placement loosely, so it is labelled *Weak control* and Line art is suggested for strict poses.
- **Face / Hand Fix**: Impact Pack `FaceDetailer` wired to Anima's own model, CLIP and VAE.
- **Face Swap**: **not offered.** InsightFace-based swappers (ReActor / inswapper) are trained on
  photographs and do not detect anime faces reliably. Use Face Fix with a character prompt or LoRA.
- Regional prompts and IPAdapter references are not included: Anima rejects area conditioning
  (live test) and no IPAdapter exists for it.

## SDXL (SDXL 1.0, Illustrious, NoobAI, Pony)

Reference template: `image_sdxl_simple`; control types from ComfyUI
`comfy/cldm/control_types.py`; ControlNet: [xinsir/controlnet-union-sdxl-1.0](https://huggingface.co/xinsir/controlnet-union-sdxl-1.0) (ProMax).

- **Generate**: checkpoint → `LoraLoader` chain (model + CLIP) → KSampler 28 / CFG 6 /
  euler_ancestral / normal (a good default for Illustrious-family checkpoints; change in Advanced
  for photo checkpoints). v-prediction checkpoints are detected by ComfyUI itself.
- **Inpaint / Outpaint**: Union ProMax in `repaint` mode (control image = picture with the masked
  area black) + `VAEEncode` + `SetLatentNoiseMask`. `VAEEncodeForInpaint` is used only for
  checkpoints whose name says *inpaint*: on regular checkpoints such as Illustrious it ignores
  the surroundings (Anima Studio live A/B pasted an unrelated scene into the mask).
- **ControlNet**: a dedicated SDXL net for the chosen type when installed (e.g. a canny net),
  otherwise Union ProMax with `SetUnionControlNetType` (`canny/lineart/anime_lineart/mlsd`,
  `hed/pidi/scribble/ted`, `depth`, `openpose`). SD 1.5 / Flux / other nets are filtered out.
  Defaults: strength 0.7, released at 80 % so the model can finish details.
- **Pose**: DWPose skeleton → OpenPose-capable net (strength 0.9, end 0.9) on a fresh latent sized
  to the reference; an optional light depth guide keeps the silhouette.
- **Face Swap**: ReActor (`inswapper_128`, retinaface, CodeFormer restore) → `FaceDetailer` with the
  SDXL checkpoint at 0.25 denoise so the new face takes the picture's lighting and style. This is
  the approach recommended in ReActor's own "best face swap" discussion: swap, restore, then a
  light diffusion pass.

## Z-Image (Turbo and Base)

Reference templates: `image_z_image_turbo`, `image_z_image`, `image_z_image_turbo_fun_union_controlnet`,
`utility_z_image_turbo_2k_upscaler.app`; control model card:
[alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1).

**Files**: `diffusion_models/z_image_turbo_bf16.safetensors` (or `z_image_bf16` Base),
`text_encoders/qwen_3_4b.safetensors`, `vae/ae.safetensors`, control patch in `model_patches/`.

- **Generate**: UNET → LoRAs → `ModelSamplingAuraFlow(3)` → KSampler. Turbo: 8 steps, CFG 1,
  res_multistep / simple, negative = `ConditioningZeroOut`. Base: 25 steps, CFG 4, real negative.
  Picking a model switches these automatically (the UI shows a toast).
- **ControlNet / Pose**: `ModelPatchLoader(Fun ControlNet Union)` → `ZImageFunControlnet` (or
  `QwenImageDiffsynthControlnet` on older ComfyUI; same code, no inpaint input) **before** the
  AuraFlow shift, the template's order. Types: canny, HED, depth, pose, M-LSD, plus **scribble**
  (Union 2.1) and **gray** (the 2602 release) — offered only when an installed patch has the mode.
  Automatic picks the newest full patch with the mode (2602 → 2601 → lite → 1.0); *Advanced →
  Control model* picks any installed Union patch, e.g. the **lite** file (2 GB instead of 6.7 GB)
  for less VRAM. Version and lite/full are read from the file name (ComfyUI exposes no file
  metadata). Tile models are never used as Union. Strength 0.75 / 0.8 (card: 0.65–0.9 for 2.x).
- **Img2Img + Control**: encoded source + Fun control (denoise 0.6; 0.85–0.95 restyles while the
  structure holds).
- **Inpaint / Outpaint**: Fun Union 2.x inpaint mode (`inpaint_image` + `mask`, context 0.9; the
  card recommends a higher scale for inpainting), else differential diffusion + noise mask.
  Optional **structure guide**: a control map passed in the **same** `ZImageFunControlnet` call
  (`image` next to `inpaint_image` + `mask`, same size) — for inpaint from the picture itself or a
  separate image, for outpaint from a separate image of the whole extended canvas.
- **Tile restore**: research only — the Tile ControlNet exists but no verified ComfyUI usage.
- **Upscale**: the official 2K upscaler's settings: model ×4 → resize → 5 steps, CFG 1,
  dpmpp_2m_sde / beta, denoise 0.33.
- **Face Swap**: ReActor → Z-Image face pass (0.25).

## Krea 2 (Turbo and RAW)

Reference templates: `image_krea2_turbo_t2i`, `image_krea2_turbo_t2i_int8`,
`image_krea2_turbo_int8_image_style_reference` (native in ComfyUI ≥ 0.26).

**Files**: `diffusion_models/krea2_turbo_fp8_scaled.safetensors` (or `krea2_turbo_int8_convrot`,
or a RAW file), `text_encoders/qwen3vl_4b_fp8_scaled.safetensors`, `vae/qwen_image_vae.safetensors`.

- **Generate**: Turbo 8 steps, CFG 1, euler / simple, `ConditioningZeroOut` negative.
  RAW (undistilled, meant for training) ~52 steps, CFG 4 — community-reported defaults.
- **Style Reference** (official, its own task; also optional in Text to Image):
  `krea2_style_reference` LoRA + `TextEncodeQwenImageEditPlus` (1–3 images) →
  `FluxKontextMultiReferenceLatentMethod(index_timestep_zero)` → `ModelSamplingFlux(1.15, 0.5, w, h)`,
  CFG 1. *Redraw an image in the style* (experimental) starts from the encoded source at a chosen
  strength. Style cannot be combined with identity editing or depth / pose control yet (see the
  combinations table in `CAPABILITY_MATRIX.md` for the reasons).
- **Identity Edit suite** (add-on, [comfyui-krea2edit](https://github.com/lbouaraba/comfyui-krea2edit)
  v1.2.5 + `krea2_identity_edit_v1_2` in `loras/krea2/editor/`): one shared graph —
  `Krea2EditModelPatch` (sources as in-context tokens, pixel path, `fit` geometry, `target_latent`
  wired) + `Krea2EditGroundedEncode` (the text encoder sees the images; at CFG > 1 the negative is
  an empty grounded encode) — and 19 tasks that differ in their references (image 1 = scene / the
  edited image, image 2 = subject, the trained order), masks, instruction, geometry and defaults:
  **Smart Edit, Object Remove** (RAW preferred, CFG 3, 20 steps, `ref_boost` 1), **Object Replace,
  Background Swap** (text, or a background photo as image 1), **Person Replace, Insert Person,
  Face / Head Replace** (the documented face-swap sentence; `ref_boost_mask` focused on the identity
  photo's face via the Impact face detector), **Eye Replace, Outfit Change, Virtual Try-On, Scene
  Change, Character Restage, Character Sheet** (wide), **Character Variation** (`ref_boost` < 1,
  batch), **Pose Restage** (text, or a pose photo as image 1 — experimental), **Identity Inpaint /
  Outpaint / Reframe** (masked latent + differential diffusion on the image's own geometry,
  pasted back — experimental). An optional *Limit to an area* mask keeps everything outside it
  pixel-identical. Turbo 10 steps / CFG 1; RAW 40 steps / CFG 3.5; `ref_boost` 4 for likeness;
  `grounding_px` 1024 for people, 512 for scene changes; ≤ 2 MP. Details and sources:
  `WORKFLOW_RESEARCH.md`, Phase 3.
- **ControlNet → Depth**, two methods (never sharing a LoRA):
  - *Depth Control-LoRA* ([Patil/Krea-2-depth-controlnet](https://huggingface.co/Patil/Krea-2-depth-controlnet)
    through [comfyui-krea2-controlnet](https://github.com/facok/comfyui-krea2-controlnet)):
    `Krea2ControlLoRALoader` → `Krea2ControlImageEncode` (grayscale, per-image min-max, matched to
    the latent size, the pack's recommended depth settings) → `Krea2ControlApply`.
  - *UniDepth* (*experimental*, [ComfyUI-Krea2-UniDepth](https://github.com/cicalooo/ComfyUI-Krea2-UniDepth)
    + `krea2_unidepth_depth_exp_v1` in `loras/krea2/`, offered when installed):
    `Krea2UniDepthLoRALoader` → `Krea2UniDepthConditioning` — the depth map, an optional reference
    image and a second stacked one ride Krea 2's native reference path; a start / end window (one
    for all references) and optional calibration.
- **Img2Img + Control → Depth** (*experimental*): the encoded source with either depth method
  (the control latent / UniDepth target is the source latent), partial denoise.
- **Pose** (*experimental*): the OpenPose Control-LoRA
  ([thedeoxen/Krea-2-pose-controlnet](https://huggingface.co/thedeoxen/Krea-2-pose-controlnet)) through
  [ComfyUI-Krea2-Ostris-Edit](https://github.com/ostris/ComfyUI-Krea2-Ostris-Edit), as its author
  publishes it: `Krea2OstrisEditModelPatch` → `LoraLoaderModelOnly` (1.0), the DWPose skeleton as
  image 1 of `TextEncodeKrea2OstrisEdit` for both prompts → `index_timestep_zero`, 10 steps, CFG 1,
  euler / simple; optionally from a start image. Looks come from the prompt; to keep a person,
  use Pose Restage (Identity Edit).
- **Inpaint / Outpaint**: no inpaint model exists; differential diffusion + noise mask + paste-back.
  Outpaint can be guided by the depth of the extended picture (*experimental*, depth Control-LoRA).
- **Face Swap**: ReActor → Krea 2 face pass (0.25).

---

## Shared building blocks (family-free)

| Block | Nodes | Notes |
|---|---|---|
| Face / hand detection | Impact Subpack `UltralyticsDetectorProvider` (`bbox/face_yolov8m.pt`, `bbox/hand_yolov8s.pt`, any eyes / lips bbox model) | The redraw itself always uses the calling family's model |
| Face swap | ReActor `ReActorFaceSwap` (`inswapper_128.onnx`) | Pixel-level; followed by the family's own face pass |
| Control maps | core `Canny`; core **Depth Anything 3** (`LoadDA3Model` → `DA3Inference` → `DA3Render`, used first when `models/geometry_estimation/` has a DA3 model); `comfyui_controlnet_aux`: `DWPreprocessor`, `DepthAnythingV2Preprocessor`, `LineArtPreprocessor`, `HEDPreprocessor`, `FakeScribblePreprocessor`, `M-LSDPreprocessor`, `ImageLuminanceDetector` (grayscale) | Skippable: tick *Image is already a map* and upload your own |
| Outpaint pre-fill | `INPAINT_MaskedFill` (comfyui-inpaint-nodes), Navier-Stokes | Optional; plain grey padding otherwise |
| Tiled refine | `UltimateSDUpscale` | Used automatically above 2304 px per side |
| Background removal | ComfyUI-RMBG `BiRefNetRMBG` (or `RMBG`) | Tools → Remove background; no family involved |

## What was verified, and what was not

- **Verified here** (no GPU): all 51 workflows build, conform and pass ComfyUI-style validation
  against a realistic `object_info`; every sampler and detail pass traces back to its own
  family's loaders; mixed graphs are refused; the server and UI were exercised end to end
  against a mock ComfyUI (`npm test`, `npm run test:ui`).
- **Carried over from Anima Studio's live tests** (RTX 5080, ComfyUI 0.35): Anima and SDXL
  generate / edit / inpaint / outpaint / face / hand / upscale paths, Z-Image generate / edit /
  inpaint / upscale, the Illustrious inpaint finding, LLLite context, Navier-Stokes fill, the
  karras warning.
- **Not yet run on real hardware**: Krea 2 (all tasks), Z-Image Fun ControlNet and its inpaint
  mode, Anima pose / line-art / depth control, SDXL OpenPose with Union ProMax, ReActor face swap
  in any family, Krea 2 Smart Edit. Their graphs follow the official templates and the node source
  code, but run them once on your machine before relying on them, and report what you see.

## Sources

- Comfy-Org workflow templates (index and the templates named above): https://github.com/Comfy-Org/workflow_templates
- ComfyUI source: `comfy_extras/nodes_model_patch.py` (`AnimaLLLiteApply`, `ZImageFunControlnet`, `QwenImageDiffsynthControlnet`), `comfy/cldm/control_types.py` — https://github.com/Comfy-Org/ComfyUI
- Anima: https://huggingface.co/circlestone-labs/Anima · LLLite: https://huggingface.co/kohya-ss/Anima-LLLite and https://huggingface.co/Comfy-Org/Anima-LLLite
- Z-Image Fun ControlNet Union: https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union and https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1
- Krea 2 in ComfyUI: https://blog.comfy.org/p/krea-2-open-source-models-are-now · depth control: https://github.com/facok/comfyui-krea2-controlnet, https://huggingface.co/Patil/Krea-2-depth-controlnet, https://github.com/cicalooo/ComfyUI-Krea2-UniDepth · pose: https://huggingface.co/thedeoxen/Krea-2-pose-controlnet, https://github.com/ostris/ComfyUI-Krea2-Ostris-Edit · identity edit: https://github.com/lbouaraba/comfyui-krea2edit
- SDXL ControlNet Union ProMax: https://huggingface.co/xinsir/controlnet-union-sdxl-1.0
- ReActor: https://github.com/Gourieff/ComfyUI-ReActor (node inputs; "How to get the best face swap", discussion #232)
- Impact Pack / Subpack: https://github.com/ltdrdata/ComfyUI-Impact-Pack, https://github.com/ltdrdata/ComfyUI-Impact-Subpack · detectors: https://huggingface.co/Bingsu/adetailer
- Anima Studio 1.5.1 (the uploaded project): `WORKFLOWS.md`, `TEST_REPORT.md` — live findings reused above
