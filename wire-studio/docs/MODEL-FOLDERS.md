# ComfyUI models guide

Every model file Wire Studio uses, the folder it belongs in, and a complete example of a
`ComfyUI/models` folder with each file in its place. Use it to look up where a download goes,
or to set up a new machine from scratch.

**Quick start**

1. Find your models folder (table below).
2. Put each file where the [sample tree](#sample-folder-tree) shows it. The sub-folders named
   after a family (`anima/`, `SDXL/`, `z-image/`, `krea2/`) and the `turbo/` / `regular/`
   folders are what let Wire Studio sort everything automatically.
3. In Wire Studio, open **Setup** and press **Re-check**. **Suggested models & LoRAs** lists
   every file below for each family with its folder, and marks which ones your ComfyUI already
   has (and where) and which are missing, with a download link. Selecting a task in **What is
   ready** shows the files that task uses: the suggested name and the installed file it picked.

## Where the models folder is

| ComfyUI install | Models folder |
|---|---|
| Git / manual install | `ComfyUI/models/` |
| Windows portable | `ComfyUI_windows_portable/ComfyUI/models/` |
| ComfyUI Desktop app | the folder you chose at setup (often `Documents/ComfyUI/models/`) |
| Extra folders | anything listed in `extra_model_paths.yaml` works the same way |

After adding or moving files press **Re-check** in Setup. If a file still does not appear,
restart ComfyUI (it rescans its folders on start).

## Sample folder tree

Every file Wire Studio uses, in its recommended place. Names in parentheses are where your own
models of that kind go. The right-hand column says which family uses the file and what for.

<!-- generated:tree -->
```
ComfyUI/models/
├── checkpoints/                                          ← SDXL family only (all-in-one checkpoints)
│   └── SDXL/
│       ├── regular/
│       │   ├── sd_xl_base_1.0.safetensors                SDXL · Checkpoint (model + CLIP + VAE)
│       │   └── (your Illustrious / NoobAI / Pony checkpoints)  SDXL · Checkpoints
│       └── turbo/
│           └── (your Turbo / Lightning / Hyper / DMD2 checkpoints)  SDXL · Checkpoints (few-step)
├── diffusion_models/                                     ← Anima, Z-Image and Krea 2 models (UNET-only files)
│   ├── anima/
│   │   ├── regular/
│   │   │   ├── anima-base-v1.0.safetensors               Anima · Diffusion model
│   │   │   └── anima-preview3-base.safetensors           Anima · Diffusion model (older preview) · alternative
│   │   └── turbo/
│   │       └── (your Anima Turbo / distilled models)     Anima · Diffusion model (turbo)
│   ├── z-image/
│   │   ├── turbo/
│   │   │   ├── z_image_turbo_bf16.safetensors            Z-Image · Diffusion model (Turbo)
│   │   │   └── z_image_turbo_int8_convrot.safetensors    Z-Image · Diffusion model (Turbo, int8) · alternative
│   │   └── regular/
│   │       └── z_image_bf16.safetensors                  Z-Image · Diffusion model (Base) · optional
│   └── krea2/
│       ├── turbo/
│       │   ├── krea2_turbo_fp8_scaled.safetensors        Krea 2 · Diffusion model (Turbo)
│       │   └── krea2_turbo_int8_convrot.safetensors      Krea 2 · Diffusion model (Turbo, int8) · alternative
│       └── regular/
│           └── (your Krea 2 RAW model)                   Krea 2 · Diffusion model (RAW, undistilled)
├── loras/                                                ← one folder per family, any sub-folders below it
│   ├── anima/
│   │   ├── characters/
│   │   │   └── (your Anima LoRAs)                        Anima · LoRAs (any sub-folders)
│   │   └── anima-turbo-lora-v0.2.safetensors             Anima · Turbo LoRA (8 steps) · optional
│   ├── SDXL/
│   │   └── styles/
│   │       └── (your SDXL LoRAs)                         SDXL · LoRAs (any sub-folders)
│   ├── z-image/
│   │   └── people/
│   │       └── (your Z-Image LoRAs)                      Z-Image · LoRAs (any sub-folders)
│   └── krea2/
│       ├── editor/
│       │   └── krea2_identity_edit_v1_2.safetensors      Krea 2 · Identity Edit LoRA · optional
│       ├── control/
│       │   └── (your Krea 2 depth Control-LoRA, any file name)  Krea 2 · Depth Control-LoRA · optional
│       ├── styles/
│       │   └── krea2_darkbrush.safetensors               Krea 2 · Example style LoRA
│       └── krea2_style_reference.safetensors             Krea 2 · Style reference LoRA · optional
├── text_encoders/                                        ← shared, picked by file name
│   ├── qwen_3_06b_base.safetensors                       Anima · Text encoder (Qwen3 0.6B)
│   ├── qwen_3_4b.safetensors                             Z-Image · Text encoder (Qwen3 4B)
│   ├── qwen_3_4b_fp8_mixed.safetensors                   Z-Image · Text encoder (fp8) · alternative
│   └── qwen3vl_4b_fp8_scaled.safetensors                 Krea 2 · Text encoder (Qwen3-VL 4B)
├── vae/                                                  ← shared, picked by file name
│   ├── qwen_image_vae.safetensors                        Anima + Krea 2 · VAE
│   └── ae.safetensors                                    Z-Image · VAE
├── model_patches/                                        ← control and inpaint patches (plural folder name)
│   ├── anima-lllite-inpainting-v2.safetensors            Anima · LLLite inpaint patch · recommended
│   ├── anima-lllite-any-test-like-v2.safetensors         Anima · LLLite control patch · recommended
│   ├── anima-lllite-depth-1.safetensors                  Anima · LLLite depth patch · optional
│   ├── anima-lllite-pose-1.safetensors                   Anima · LLLite pose patch · optional
│   ├── Z-Image-Turbo-Fun-Controlnet-Union.safetensors    Z-Image · Fun ControlNet Union · recommended
│   └── Z-Image-Turbo-Fun-Controlnet-Union-2.1-2601-8steps.safetensors  Z-Image · Fun ControlNet Union 2.1 · optional
├── controlnet/                                           ← SDXL ControlNets
│   └── SDXL/
│       └── controlnet-union-sdxl-1.0-promax.safetensors  SDXL · ControlNet Union ProMax · recommended
├── upscale_models/                                       ← all families
│   └── RealESRGAN_x4plus.safetensors                     Shared · Upscale model
├── ultralytics/                                          ← face / hand detectors (Impact Subpack)
│   └── bbox/
│       ├── face_yolov8m.pt                               Shared · Face detector (Impact Subpack)
│       ├── hand_yolov8s.pt                               Shared · Hand detector (Impact Subpack)
│       └── (your eyes / lips detectors, e.g. Eyes.pt)    Shared · Extra detectors
├── insightface/                                          ← face swap (ReActor)
│   └── inswapper_128.onnx                                Shared · Face swap model (ReActor)
├── facerestore_models/                                   ← face restore (ReActor)
│   ├── codeformer-v0.1.0.pth                             Shared · Face restore (ReActor) · recommended
│   └── GFPGANv1.4.pth                                    Shared · Face restore (ReActor) · optional
├── unet/                                                 ← older name for diffusion_models (also read)
├── clip/                                                 ← older name for text_encoders (also read)
├── clip_vision/                                          ← not used by Wire Studio
├── embeddings/                                           ← not used by Wire Studio
├── style_models/                                         ← not used by Wire Studio
├── hypernetworks/                                        ← not used by Wire Studio
├── gligen/                                               ← not used by Wire Studio
├── photomaker/                                           ← not used by Wire Studio
├── diffusers/                                            ← not used by Wire Studio
├── vae_approx/                                           ← live-preview decoders (TAESD), optional
└── configs/                                              ← not used by Wire Studio
```
<!-- /generated:tree -->

The `turbo/` and `regular/` sub-folders are optional when a file name already says what the
model is (`z_image_turbo_bf16` is clearly Turbo). Use them whenever it does not.

## Model list

Every file by family, with what it is for, how much you need it, and where to get it. Links
marked *Download* are direct files taken from Comfy-Org's official workflow templates; *Project
page* links go to the model's own page where a direct link could not be verified.

<!-- generated:models -->
**Need:** *Required* — the family (or, for shared helpers, the task) cannot run without it · *Recommended* — needed by a main task or for clearly better results · *Optional* — enables an extra feature · *Alternative* — use instead of the file above it · *Your files* — where your own models go.

### Anima

| File | Folder (inside models/) | Used for | Need | Get it |
|---|---|---|---|---|
| `anima-base-v1.0.safetensors` | `diffusion_models/anima/regular/` | Diffusion model: All Anima tasks | Required | [Download](https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-base-v1.0.safetensors) |
| `anima-preview3-base.safetensors` | `diffusion_models/anima/regular/` | Diffusion model (older preview): All Anima tasks | Alternative | [Download](https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-preview3-base.safetensors) |
| *your Anima Turbo / distilled models* | `diffusion_models/anima/turbo/` | Diffusion model (turbo): 10 steps · CFG 1 preset | Your files | — |
| `qwen_3_06b_base.safetensors` | `text_encoders/` | Text encoder (Qwen3 0.6B): All Anima tasks | Required | [Download](https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/text_encoders/qwen_3_06b_base.safetensors) |
| `qwen_image_vae.safetensors` | `vae/` | VAE: All Anima and Krea 2 tasks | Required | [Download](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors) |
| `anima-turbo-lora-v0.2.safetensors` | `loras/anima/` | Turbo LoRA (8 steps): The Turbo switch | Optional | [Download](https://huggingface.co/circlestone-labs/Anima-Official-LoRAs/resolve/main/anima-turbo-lora-v0.2.safetensors) |
| *your Anima LoRAs* | `loras/anima/characters/` | LoRAs (any sub-folders): Any Anima task | Your files | — |
| `anima-lllite-inpainting-v2.safetensors` | `model_patches/` | LLLite inpaint patch: Inpaint, Outpaint | Recommended | [Download](https://huggingface.co/Comfy-Org/Anima-LLLite/resolve/main/model_patches/anima-lllite-inpainting-v2.safetensors) |
| `anima-lllite-any-test-like-v2.safetensors` | `model_patches/` | LLLite control patch: ControlNet: line art, canny, scribble | Recommended | [Download](https://huggingface.co/Comfy-Org/Anima-LLLite/resolve/main/model_patches/anima-lllite-any-test-like-v2.safetensors) |
| `anima-lllite-depth-1.safetensors` | `model_patches/` | LLLite depth patch: ControlNet: depth | Optional | [Download](https://huggingface.co/Comfy-Org/Anima-LLLite/resolve/main/model_patches/anima-lllite-depth-1.safetensors) |
| `anima-lllite-pose-1.safetensors` | `model_patches/` | LLLite pose patch: Pose | Optional | [Download](https://huggingface.co/kohya-ss/Anima-LLLite/resolve/main/anima-lllite-pose-1.safetensors) |

### SDXL

| File | Folder (inside models/) | Used for | Need | Get it |
|---|---|---|---|---|
| `sd_xl_base_1.0.safetensors` — any SDXL / Illustrious / NoobAI / Pony checkpoint | `checkpoints/SDXL/regular/` | Checkpoint (model + CLIP + VAE): All SDXL tasks — or any SDXL, Illustrious, NoobAI, Pony checkpoint | Required | [Download](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors?download=true) |
| *your Illustrious / NoobAI / Pony checkpoints* | `checkpoints/SDXL/regular/` | Checkpoints: 28 steps · CFG 6 preset | Your files | — |
| *your Turbo / Lightning / Hyper / DMD2 checkpoints* | `checkpoints/SDXL/turbo/` | Checkpoints (few-step): 8 steps · CFG 1.5 preset | Your files | — |
| *your SDXL LoRAs* | `loras/SDXL/styles/` | LoRAs (any sub-folders): Any SDXL task | Your files | — |
| `controlnet-union-sdxl-1.0-promax.safetensors` | `controlnet/SDXL/` | ControlNet Union ProMax: Inpaint and Outpaint context, Pose, ControlNet (all types) | Recommended | [Download](https://huggingface.co/xinsir/controlnet-union-sdxl-1.0/resolve/main/diffusion_pytorch_model_promax.safetensors) |

### Z-Image

| File | Folder (inside models/) | Used for | Need | Get it |
|---|---|---|---|---|
| `z_image_turbo_bf16.safetensors` | `diffusion_models/z-image/turbo/` | Diffusion model (Turbo): All Z-Image tasks | Required | [Download](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors) |
| `z_image_turbo_int8_convrot.safetensors` | `diffusion_models/z-image/turbo/` | Diffusion model (Turbo, int8): Smaller / faster Turbo | Alternative | [Download](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_int8_convrot.safetensors) |
| `z_image_bf16.safetensors` | `diffusion_models/z-image/regular/` | Diffusion model (Base): 25 steps · CFG 4 preset, real negative prompt | Optional | [Download](https://huggingface.co/Comfy-Org/z_image/resolve/main/split_files/diffusion_models/z_image_bf16.safetensors) |
| `qwen_3_4b.safetensors` | `text_encoders/` | Text encoder (Qwen3 4B): All Z-Image tasks | Required | [Download](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors) |
| `qwen_3_4b_fp8_mixed.safetensors` | `text_encoders/` | Text encoder (fp8): Less VRAM | Alternative | [Download](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b_fp8_mixed.safetensors) |
| `ae.safetensors` | `vae/` | VAE: All Z-Image tasks | Required | [Download](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors) |
| *your Z-Image LoRAs* | `loras/z-image/people/` | LoRAs (any sub-folders): Any Z-Image task | Your files | — |
| `Z-Image-Turbo-Fun-Controlnet-Union.safetensors` | `model_patches/` | Fun ControlNet Union: Pose, ControlNet (canny, HED, depth, pose, M-LSD) | Recommended | [Download](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors) |
| `Z-Image-Turbo-Fun-Controlnet-Union-2.1-2601-8steps.safetensors` | `model_patches/` | Fun ControlNet Union 2.1: Adds context-aware Inpaint / Outpaint; also does all ControlNet types | Optional | [Project page](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1) |

### Krea 2

| File | Folder (inside models/) | Used for | Need | Get it |
|---|---|---|---|---|
| `krea2_turbo_fp8_scaled.safetensors` | `diffusion_models/krea2/turbo/` | Diffusion model (Turbo): All Krea 2 tasks | Required | [Download](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/diffusion_models/krea2_turbo_fp8_scaled.safetensors) |
| `krea2_turbo_int8_convrot.safetensors` | `diffusion_models/krea2/turbo/` | Diffusion model (Turbo, int8): Better than fp8 and often faster | Alternative | [Download](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/diffusion_models/krea2_turbo_int8_convrot.safetensors) |
| *your Krea 2 RAW model* | `diffusion_models/krea2/regular/` | Diffusion model (RAW, undistilled): 52 steps · CFG 4 preset | Your files | — |
| `qwen3vl_4b_fp8_scaled.safetensors` | `text_encoders/` | Text encoder (Qwen3-VL 4B): All Krea 2 tasks | Required | [Download](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors) |
| `qwen_image_vae.safetensors` | `vae/` | VAE (the same file as Anima): All Krea 2 tasks | Required | [Download](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors) |
| `krea2_style_reference.safetensors` | `loras/krea2/` | Style reference LoRA: Text to Image → Style reference | Optional | [Download](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_style_reference.safetensors) |
| `krea2_identity_edit_v1_2.safetensors` | `loras/krea2/editor/` | Identity Edit LoRA: Smart Edit (with the comfyui-krea2edit nodes) | Optional | [Project page](https://github.com/lbouaraba/comfyui-krea2edit) |
| *your Krea 2 depth Control-LoRA, any file name* | `loras/krea2/control/` | Depth Control-LoRA: ControlNet: depth, Pose (with comfyui-krea2-controlnet) | Optional | [Project page](https://huggingface.co/Patil/Krea-2-depth-controlnet) |
| `krea2_darkbrush.safetensors` | `loras/krea2/styles/` | Example style LoRA: Any Krea 2 task | Your files | [Download](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors) |

### Shared helpers (all families)

| File | Folder (inside models/) | Used for | Need | Get it |
|---|---|---|---|---|
| `RealESRGAN_x4plus.safetensors` | `upscale_models/` | Upscale model: Upscale (all families) | Required | [Download](https://huggingface.co/Comfy-Org/Real-ESRGAN_repackaged/resolve/main/RealESRGAN_x4plus.safetensors) |
| `face_yolov8m.pt` | `ultralytics/bbox/` | Face detector (Impact Subpack): Face Fix, Face Swap blend | Required | [Download](https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt) |
| `hand_yolov8s.pt` | `ultralytics/bbox/` | Hand detector (Impact Subpack): Hand Fix | Required | [Download](https://huggingface.co/Bingsu/adetailer/resolve/main/hand_yolov8s.pt) |
| *your eyes / lips detectors, e.g. Eyes.pt* | `ultralytics/bbox/` | Extra detectors: Face Fix → Eyes / Lips | Your files | — |
| `inswapper_128.onnx` | `insightface/` | Face swap model (ReActor): Face Swap | Required | [Project page](https://github.com/Gourieff/ComfyUI-ReActor#installation) |
| `codeformer-v0.1.0.pth` | `facerestore_models/` | Face restore (ReActor): Face Swap → Face restore | Recommended | [Project page](https://github.com/Gourieff/ComfyUI-ReActor#installation) |
| `GFPGANv1.4.pth` | `facerestore_models/` | Face restore (ReActor): Face Swap → Face restore | Optional | [Project page](https://github.com/Gourieff/ComfyUI-ReActor#installation) |

### Downloaded automatically

| What | Where | By |
|---|---|---|
| Pose / depth / line-art preprocessors | `custom_nodes/comfyui_controlnet_aux/ckpts/` | comfyui_controlnet_aux, on first use |
| Background removal (BiRefNet) | `models/RMBG/` | ComfyUI-RMBG, on first use |
| Face analysis for face swap (buffalo_l) | `models/insightface/models/` | ReActor, on first use |
<!-- /generated:models -->

## Find a file (A–Z)

<!-- generated:index -->
| File | Folder | Family |
|---|---|---|
| `ae.safetensors` | `models/vae/` | Z-Image |
| `anima-base-v1.0.safetensors` | `models/diffusion_models/anima/regular/` | Anima |
| `anima-lllite-any-test-like-v2.safetensors` | `models/model_patches/` | Anima |
| `anima-lllite-depth-1.safetensors` | `models/model_patches/` | Anima |
| `anima-lllite-inpainting-v2.safetensors` | `models/model_patches/` | Anima |
| `anima-lllite-pose-1.safetensors` | `models/model_patches/` | Anima |
| `anima-preview3-base.safetensors` | `models/diffusion_models/anima/regular/` | Anima |
| `anima-turbo-lora-v0.2.safetensors` | `models/loras/anima/` | Anima |
| `codeformer-v0.1.0.pth` | `models/facerestore_models/` | Shared |
| `controlnet-union-sdxl-1.0-promax.safetensors` | `models/controlnet/SDXL/` | SDXL |
| `face_yolov8m.pt` | `models/ultralytics/bbox/` | Shared |
| `GFPGANv1.4.pth` | `models/facerestore_models/` | Shared |
| `hand_yolov8s.pt` | `models/ultralytics/bbox/` | Shared |
| `inswapper_128.onnx` | `models/insightface/` | Shared |
| `krea2_darkbrush.safetensors` | `models/loras/krea2/styles/` | Krea 2 |
| `krea2_identity_edit_v1_2.safetensors` | `models/loras/krea2/editor/` | Krea 2 |
| `krea2_style_reference.safetensors` | `models/loras/krea2/` | Krea 2 |
| `krea2_turbo_fp8_scaled.safetensors` | `models/diffusion_models/krea2/turbo/` | Krea 2 |
| `krea2_turbo_int8_convrot.safetensors` | `models/diffusion_models/krea2/turbo/` | Krea 2 |
| `qwen_3_06b_base.safetensors` | `models/text_encoders/` | Anima |
| `qwen_3_4b_fp8_mixed.safetensors` | `models/text_encoders/` | Z-Image |
| `qwen_3_4b.safetensors` | `models/text_encoders/` | Z-Image |
| `qwen_image_vae.safetensors` | `models/vae/` | Anima, Krea 2 |
| `qwen3vl_4b_fp8_scaled.safetensors` | `models/text_encoders/` | Krea 2 |
| `RealESRGAN_x4plus.safetensors` | `models/upscale_models/` | Shared |
| `sd_xl_base_1.0.safetensors` | `models/checkpoints/SDXL/regular/` | SDXL |
| `z_image_bf16.safetensors` | `models/diffusion_models/z-image/regular/` | Z-Image |
| `z_image_turbo_bf16.safetensors` | `models/diffusion_models/z-image/turbo/` | Z-Image |
| `z_image_turbo_int8_convrot.safetensors` | `models/diffusion_models/z-image/turbo/` | Z-Image |
| `Z-Image-Turbo-Fun-Controlnet-Union-2.1-2601-8steps.safetensors` | `models/model_patches/` | Z-Image |
| `Z-Image-Turbo-Fun-Controlnet-Union.safetensors` | `models/model_patches/` | Z-Image |
<!-- /generated:index -->

## How Wire Studio sorts your files

**1. The first folder named after a family decides the family**, at any depth. Everything below
it can be organised however you like (`loras/SDXL/characters/2025/…` is fine).

| Family | Folder names that work | Not this family |
|---|---|---|
| Anima | `anima`, `Anima`, `Anima_Turbo`, `AnimaLoRA`, `anima-models` | `Animagine…` (that is SDXL), `animation`, `animatediff` |
| SDXL | `SDXL`, `sdxl`, `Illustrious`, `NoobAI`, `Pony`, anything with `XL` in it | `refiner`, `sd15`, `sd3` |
| Z-Image | `z-image`, `Z-Image`, `zimage`, `z_image`, `Z Image` | |
| Krea 2 | `krea2`, `Krea-2`, `krea_2` | `flux1-krea-dev` (that is FLUX, not Krea 2) |

Folders for families Wire Studio does not run (`flux`, `sd15`, `sd3`, `wan`, `qwen`, `hunyuan`,
`ltx`…) are ignored, so those files never show up in the wrong place. With no family folder, the
file name is used instead (for example `z_image_turbo_bf16.safetensors` is Z-Image).

**2. A `turbo` or `regular` folder decides the model type**, and with it the sampling preset:

| Type | Folder names (or a word in the folder name) | File name fallback |
|---|---|---|
| Turbo / few-step | `turbo`, `lightning`, `hyper`, `dmd2`, `lcm`, `distilled`, `fast` — also `Anima_Turbo`, `SDXL-Lightning` | name contains `turbo`, `lightning`, `hyper`, `dmd2`, `lcm`, `distill` |
| Regular | `regular`, `base`, `raw`, `standard`, `normal`, `full`, `dev` | everything else |

The deepest type folder wins, and a folder always beats the file name, so a model whose name
says nothing (or the wrong thing) can be put into the right folder.

**3. Shared folders** (`text_encoders`, `vae`, `model_patches`, `upscale_models`, detectors) are
read by file name, so keep the original names there.

**4. Krea 2 task LoRAs have their own folders** under `loras/krea2/`, so they never appear in the
LoRA picker and any file name works:

| Folder | Holds | Used by |
|---|---|---|
| `loras/krea2/editor/` (also `edit/`, `editing/`) | the Identity Edit LoRA (`krea2_identity_edit_v1_2.safetensors`) | Smart Edit |
| `loras/krea2/control/` | Control-LoRAs (depth) | ControlNet, Pose |

Outside these folders they are still found by name (`krea2_identity_edit…`, `…depth…control…`).
With several edit LoRAs, the one in `editor/` wins, then the highest version.

## Presets

Applied when you pick a model (change them any time under *Advanced*):

| Family | Turbo | Regular |
|---|---|---|
| Anima | 10 steps · CFG 1 · euler / simple | 30 steps · CFG 4 · euler / simple |
| SDXL | 8 steps · CFG 1.5 · euler / sgm_uniform — a starting point; Turbo, Lightning, Hyper and DMD2 models differ, so check the model's page | 28 steps · CFG 6 · euler_ancestral / normal |
| Z-Image | 8 steps · CFG 1 · res_multistep / simple (official) | 25 steps · CFG 4 (Base) |
| Krea 2 | 8 steps · CFG 1 · euler / simple (official) | 52 steps · CFG 4 (RAW) |

## Adding a model that is not listed

- **A fine-tune or merge** of a supported family: put it in that family's model folder, under
  `turbo/` or `regular/` to match how it should be sampled.
- **A LoRA:** put it anywhere under `loras/<family>/`.
- **Anything with an unclear name** in a shared or top-level folder appears in **Setup →
  Library** as *unsorted*; assign it to a family there once and it is remembered.
- **Models for other families** (FLUX, SD 1.5, Qwen-Image, Wan…) can stay where they are; Wire
  Studio never offers them. Setup → Library lists them apart under *Other model families*.

## Common mistakes

- **Anima / Z-Image / Krea 2 file in `checkpoints/`.** These are diffusion models: ComfyUI only
  loads them from `diffusion_models/` (or the older `unet/`). Setup → Library lists any such
  file and where to move it.
- **`model_patch` instead of `model_patches`.** The folder name is plural.
- **An Animagine checkpoint in an `anima/` folder.** Animagine is SDXL; put it under `SDXL/`.
- **Renamed shared files** (`my_vae.safetensors`). Text encoders, VAEs and patches are found by
  their original names; keep them.
- **FLUX.1 Krea dev** is a FLUX model, not Krea 2; it is ignored on purpose.

## Optional: one tree for checkpoints and diffusion models

To keep every family under `checkpoints/`, let ComfyUI also read that folder as a
diffusion-model folder. Add this to `extra_model_paths.yaml` (next to ComfyUI's `main.py`), then
restart ComfyUI:

```yaml
wire_studio:
  base_path: /path/to/ComfyUI/models/
  diffusion_models: checkpoints/
```

The family folders keep everything apart: Anima, Z-Image and Krea 2 files then load through the
diffusion-model loader, while only SDXL files appear as SDXL checkpoints.

---

This guide is generated in part from `engine/model-list.mjs`, the same list Setup uses for its
download suggestions. After changing that list, run `npm run docs`.
