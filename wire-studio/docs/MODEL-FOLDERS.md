# ComfyUI folder guide

How to lay out your **ComfyUI `models` folder** so Wire Studio sorts every file into the right
family (Anima, SDXL, Z-Image, Krea 2) and picks the right settings for Turbo and regular models.

## Where the models folder is

| ComfyUI install | Models folder |
|---|---|
| Git / manual install | `ComfyUI/models/` |
| Windows portable | `ComfyUI_windows_portable/ComfyUI/models/` |
| ComfyUI Desktop app | the folder you chose at setup (often `Documents/ComfyUI/models/`) |
| Extra folders | anything listed in `extra_model_paths.yaml` works the same way |

After moving or adding files, press **Re-check** in Wire Studio's Setup. If a file still does
not show up, restart ComfyUI (it rescans folders on start).

## The two rules

**1. The first folder named after a family decides the family**, at any depth. Everything below
it can be organised however you like:

| Family | Folder names that work | Not this family |
|---|---|---|
| Anima | `anima`, `Anima`, `Anima_Turbo`, `AnimaLoRA`, `anima-models` | `Animagine…` (that is SDXL), `animation`, `animatediff` |
| SDXL | `SDXL`, `sdxl`, `Illustrious`, `NoobAI`, `Pony`, anything with `XL` in it | `refiner`, `sd15`, `sd3` |
| Z-Image | `z-image`, `Z-Image`, `zimage`, `z_image`, `Z Image` | |
| Krea 2 | `krea2`, `Krea-2`, `krea_2` | `flux1-krea-dev` (that is FLUX, not Krea 2) |

Folders for families Wire Studio does not run (`flux`, `sd15`, `sd3`, `wan`, `qwen`, `hunyuan`,
`ltx`…) are ignored, so those files never appear in the wrong place. With no family folder, the
file name is used instead (e.g. `z_image_turbo_bf16.safetensors` is Z-Image).

**2. A `turbo` or `regular` folder decides the model type**, and with it the sampling preset:

| Type | Folder names (or a word in the folder name) | File name fallback |
|---|---|---|
| Turbo / few-step | `turbo`, `lightning`, `hyper`, `dmd2`, `lcm`, `distilled`, `fast` — also `Anima_Turbo`, `SDXL-Lightning` | name contains `turbo`, `lightning`, `hyper`, `dmd2`, `lcm`, `distill` |
| Regular | `regular`, `base`, `raw`, `standard`, `normal`, `full`, `dev` | everything else |

The deepest type folder wins, and a folder always beats the file name, so you can put a model
whose name says nothing (or says the wrong thing) into the right folder.

Presets applied when you pick a model (you can still change them under *Advanced*):

| Family | Turbo | Regular |
|---|---|---|
| Anima | 10 steps · CFG 1 · euler / simple | 30 steps · CFG 4 · euler / simple |
| SDXL | 8 steps · CFG 1.5 · euler / sgm_uniform (check the model page; Turbo / Lightning / Hyper / DMD2 models differ) | 28 steps · CFG 6 · euler_ancestral / normal |
| Z-Image | 8 steps · CFG 1 · res_multistep / simple (official) | 25 steps · CFG 4 (Base) |
| Krea 2 | 8 steps · CFG 1 · euler / simple (official) | 52 steps · CFG 4 (RAW) |

## Recommended layout

```
ComfyUI/models/
├── checkpoints/                      ← SDXL family only (all-in-one checkpoints)
│   └── SDXL/
│       ├── regular/                  Illustrious-XL-v2.0.safetensors, juggernautXL_v9.safetensors …
│       └── turbo/                    dreamshaperXL_lightning.safetensors, any DMD2 / Hyper merge …
│
├── diffusion_models/                 ← Anima, Z-Image and Krea 2 models (UNET-only files)
│   ├── anima/
│   │   ├── regular/                  anima-base-v1.0.safetensors, your Anima fine-tunes …
│   │   └── turbo/                    turbo / distilled Anima models …
│   ├── z-image/
│   │   ├── turbo/                    z_image_turbo_bf16.safetensors (or _int8_convrot)
│   │   └── regular/                  z_image_bf16.safetensors (Z-Image Base)
│   └── krea2/
│       ├── turbo/                    krea2_turbo_fp8_scaled.safetensors (or _int8_convrot)
│       └── regular/                  Krea 2 RAW
│
├── loras/                            ← sub-folders below the family folder are free-form
│   ├── anima/                        characters/ styles/ concepts/ … (anima-turbo-lora-v0.2 can sit anywhere)
│   ├── SDXL/                         characters/ styles/ Illustrious/ Pony/ …
│   ├── z-image/                      people/ styles/ …
│   └── krea2/
│       ├── styles/                   krea2_darkbrush.safetensors …
│       ├── control/                  the Krea 2 depth Control-LoRA (anything in control/ is a control LoRA)
│       ├── krea2_style_reference.safetensors
│       └── krea2_identity_edit_v1_2.safetensors
│
├── text_encoders/                    ← shared folder, picked by file name
│   ├── qwen_3_06b_base.safetensors        Anima
│   ├── qwen_3_4b.safetensors              Z-Image
│   └── qwen3vl_4b_fp8_scaled.safetensors  Krea 2
│
├── vae/
│   ├── qwen_image_vae.safetensors         Anima and Krea 2
│   └── ae.safetensors                     Z-Image
│
├── model_patches/                    ← control / inpaint patches (note the plural folder name)
│   ├── anima-lllite-inpainting-v2.safetensors       Anima inpaint / outpaint
│   ├── anima-lllite-any-test-like-v2.safetensors    Anima line art / canny / scribble
│   ├── anima-lllite-depth-1.safetensors             Anima depth
│   ├── anima-lllite-pose-1.safetensors              Anima pose
│   └── Z-Image-Turbo-Fun-Controlnet-Union-2.1-…safetensors   Z-Image control + inpaint
│
├── controlnet/
│   └── SDXL/                         controlnet-union-sdxl-1.0-promax.safetensors (+ any dedicated SDXL nets)
│
├── upscale_models/                   RealESRGAN_x4plus.safetensors, 4x-AnimeSharp.pth …
├── ultralytics/
│   └── bbox/                         face_yolov8m.pt, hand_yolov8s.pt (+ eyes / lips detectors)
├── insightface/                      inswapper_128.onnx (face swap, ReActor)
└── facerestore_models/               codeformer-v0.1.0.pth, GFPGANv1.4.pth (ReActor)
```

The `turbo/` and `regular/` sub-folders are optional: a single `anima/` or `SDXL/` folder works,
and the file name then decides the type. Use them whenever a file name does not say what it is.

## Per-family checklist

### Anima
| File | Folder | Download |
|---|---|---|
| `anima-base-v1.0.safetensors` | `diffusion_models/anima/regular/` | [circlestone-labs/Anima](https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-base-v1.0.safetensors) |
| `qwen_3_06b_base.safetensors` | `text_encoders/` | [link](https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/text_encoders/qwen_3_06b_base.safetensors) |
| `qwen_image_vae.safetensors` | `vae/` | [link](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors) |
| `anima-turbo-lora-v0.2.safetensors` (optional 8-step mode) | `loras/anima/` | [link](https://huggingface.co/circlestone-labs/Anima-Official-LoRAs/resolve/main/anima-turbo-lora-v0.2.safetensors) |
| LLLite patches (inpaint, control, pose) | `model_patches/` | [Comfy-Org/Anima-LLLite](https://huggingface.co/Comfy-Org/Anima-LLLite/tree/main/model_patches), [kohya-ss/Anima-LLLite](https://huggingface.co/kohya-ss/Anima-LLLite) (pose) |

### SDXL (SDXL, Illustrious, NoobAI, Pony)
| File | Folder | Download |
|---|---|---|
| any SDXL-family checkpoint | `checkpoints/SDXL/regular/` or `…/turbo/` | e.g. [SDXL base 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) |
| ControlNet Union ProMax (inpaint, pose, control) | `controlnet/SDXL/` | [xinsir/controlnet-union-sdxl-1.0](https://huggingface.co/xinsir/controlnet-union-sdxl-1.0/resolve/main/diffusion_pytorch_model_promax.safetensors) — rename to `controlnet-union-sdxl-1.0-promax.safetensors` |

### Z-Image
| File | Folder | Download |
|---|---|---|
| `z_image_turbo_bf16.safetensors` | `diffusion_models/z-image/turbo/` | [Comfy-Org/z_image_turbo](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors) |
| `z_image_bf16.safetensors` (Base) | `diffusion_models/z-image/regular/` | [Comfy-Org/z_image](https://huggingface.co/Comfy-Org/z_image/resolve/main/split_files/diffusion_models/z_image_bf16.safetensors) |
| `qwen_3_4b.safetensors` | `text_encoders/` | [link](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors) |
| `ae.safetensors` | `vae/` | [link](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors) |
| Fun ControlNet Union (2.1 for inpaint) | `model_patches/` | [2.0](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union) · [2.1](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1) |

### Krea 2
| File | Folder | Download |
|---|---|---|
| `krea2_turbo_fp8_scaled.safetensors` | `diffusion_models/krea2/turbo/` | [Comfy-Org/Krea-2](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/diffusion_models/krea2_turbo_fp8_scaled.safetensors) |
| `qwen3vl_4b_fp8_scaled.safetensors` | `text_encoders/` | [link](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors) |
| `qwen_image_vae.safetensors` | `vae/` | [link](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors) |
| `krea2_style_reference.safetensors` (optional) | `loras/krea2/` | [link](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_style_reference.safetensors) |
| depth Control-LoRA (optional) | `loras/krea2/control/` | [Patil/Krea-2-depth-controlnet](https://huggingface.co/Patil/Krea-2-depth-controlnet) |
| Identity Edit LoRA (optional, Smart Edit) | `loras/krea2/` | [comfyui-krea2edit](https://github.com/lbouaraba/comfyui-krea2edit) |

### Shared helpers
| What | Folder | Notes |
|---|---|---|
| Upscale models | `upscale_models/` | [RealESRGAN_x4plus](https://huggingface.co/Comfy-Org/Real-ESRGAN_repackaged/resolve/main/RealESRGAN_x4plus.safetensors) |
| Face / hand detectors | `ultralytics/bbox/` | [face_yolov8m.pt, hand_yolov8s.pt](https://huggingface.co/Bingsu/adetailer) (Impact Subpack) |
| Face swap | `insightface/`, `facerestore_models/` | see [ReActor installation](https://github.com/Gourieff/ComfyUI-ReActor#installation) |
| Pose / depth / line-art preprocessors | (automatic) | comfyui_controlnet_aux downloads its own weights on first use |
| Background removal | (automatic) | ComfyUI-RMBG downloads its own weights on first use |

## Common mistakes

- **Anima / Z-Image / Krea 2 file in `checkpoints/`.** These are diffusion models: ComfyUI only
  loads them from `diffusion_models/` (or the older `unet/`). Setup → Library lists any such
  file with where to move it.
- **`model_patch` instead of `model_patches`.** The folder name is plural.
- **An Animagine checkpoint in an `anima/` folder.** Animagine is SDXL; put it under `SDXL/`.
- **A LoRA in the top `loras/` folder with a generic name** (`detail_tweaker.safetensors`). It
  appears as *unsorted* in Setup → Library; move it into a family folder or assign it there once.
- **FLUX.1 Krea dev** is a FLUX model, not Krea 2; it is ignored on purpose.

## Optional: one tree for checkpoints and diffusion models

If you prefer to keep every family under `checkpoints/`, let ComfyUI also read that folder as a
diffusion-model folder by adding this to `extra_model_paths.yaml` (next to ComfyUI's `main.py`),
then restart ComfyUI:

```yaml
wire_studio:
  base_path: /path/to/ComfyUI/models/
  diffusion_models: checkpoints/
```

Family folders keep everything apart: Anima, Z-Image and Krea 2 files then load through the
diffusion-model loader, while only SDXL files appear as SDXL checkpoints.
