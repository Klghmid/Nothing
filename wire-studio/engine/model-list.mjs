// Every model file Wire Studio uses or suggests, with its default place under ComfyUI/models/.
// Single source of truth for Setup's "what is missing" help (catalog.mjs MODELS) and for the
// ComfyUI models guide (docs/MODEL-FOLDERS.md; regenerate with `npm run docs`).
//
//   key       name used by the workflow code (only for files Setup can ask for)
//   path      folder under ComfyUI/models/ (the recommended sub-folder; flat also works when
//             the file name says the family / type)
//   need      required · recommended · optional · alternative · example
//   url       direct download where verified (official template metadata), else the project page
//   display   wording for Setup when the file name is only an example
const HF = "https://huggingface.co/";

export const FAMILY_ORDER = ["Anima", "SDXL", "Z-Image", "Krea 2", "Shared"];

export const MODEL_LIST = [
  // ── Anima ────────────────────────────────────────────────────────────────────────────────
  { key: "animaBase", family: "Anima", file: "anima-base-v1.0.safetensors", path: "diffusion_models/anima/regular", role: "Diffusion model", need: "required", tasks: "All Anima tasks", url: HF + "circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-base-v1.0.safetensors" },
  { family: "Anima", file: "anima-preview3-base.safetensors", path: "diffusion_models/anima/regular", role: "Diffusion model (older preview)", need: "alternative", tasks: "All Anima tasks", url: HF + "circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-preview3-base.safetensors" },
  { family: "Anima", file: "your Anima Turbo / distilled models", path: "diffusion_models/anima/turbo", role: "Diffusion model (turbo)", need: "example", tasks: "10 steps · CFG 1 preset" },
  { key: "animaClip", family: "Anima", file: "qwen_3_06b_base.safetensors", path: "text_encoders", role: "Text encoder (Qwen3 0.6B)", need: "required", tasks: "All Anima tasks", url: HF + "circlestone-labs/Anima/resolve/main/split_files/text_encoders/qwen_3_06b_base.safetensors" },
  { key: "qwenImageVae", family: "Anima", file: "qwen_image_vae.safetensors", path: "vae", role: "VAE", need: "required", tasks: "All Anima and Krea 2 tasks", url: HF + "Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors" },
  { key: "animaTurbo", family: "Anima", file: "anima-turbo-lora-v0.2.safetensors", path: "loras/anima", role: "Turbo LoRA (8 steps)", need: "optional", tasks: "The Turbo switch", url: HF + "circlestone-labs/Anima-Official-LoRAs/resolve/main/anima-turbo-lora-v0.2.safetensors" },
  { family: "Anima", file: "your Anima LoRAs", path: "loras/anima/characters", role: "LoRAs (any sub-folders)", need: "example", tasks: "Any Anima task" },
  { key: "animaInpaint", family: "Anima", file: "anima-lllite-inpainting-v2.safetensors", path: "model_patches", role: "LLLite inpaint patch", need: "recommended", tasks: "Inpaint, Outpaint", url: HF + "Comfy-Org/Anima-LLLite/resolve/main/model_patches/anima-lllite-inpainting-v2.safetensors" },
  { key: "animaAny", family: "Anima", file: "anima-lllite-any-test-like-v2.safetensors", path: "model_patches", role: "LLLite control patch", need: "recommended", tasks: "ControlNet: line art, canny, scribble", url: HF + "Comfy-Org/Anima-LLLite/resolve/main/model_patches/anima-lllite-any-test-like-v2.safetensors" },
  { key: "animaDepth", family: "Anima", file: "anima-lllite-depth-1.safetensors", path: "model_patches", role: "LLLite depth patch", need: "optional", tasks: "ControlNet: depth", url: HF + "Comfy-Org/Anima-LLLite/resolve/main/model_patches/anima-lllite-depth-1.safetensors" },
  { key: "animaPose", family: "Anima", file: "anima-lllite-pose-1.safetensors", path: "model_patches", role: "LLLite pose patch", need: "optional", tasks: "Pose", url: HF + "kohya-ss/Anima-LLLite/resolve/main/anima-lllite-pose-1.safetensors" },

  // ── SDXL ─────────────────────────────────────────────────────────────────────────────────
  { key: "sdxlBase", family: "SDXL", file: "sd_xl_base_1.0.safetensors", display: "any SDXL / Illustrious / NoobAI / Pony checkpoint", path: "checkpoints/SDXL/regular", role: "Checkpoint (model + CLIP + VAE)", need: "required", tasks: "All SDXL tasks — or any SDXL, Illustrious, NoobAI, Pony checkpoint", url: HF + "stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors?download=true" },
  { family: "SDXL", file: "your Illustrious / NoobAI / Pony checkpoints", path: "checkpoints/SDXL/regular", role: "Checkpoints", need: "example", tasks: "28 steps · CFG 6 preset" },
  { family: "SDXL", file: "your Turbo / Lightning / Hyper / DMD2 checkpoints", path: "checkpoints/SDXL/turbo", role: "Checkpoints (few-step)", need: "example", tasks: "8 steps · CFG 1.5 preset" },
  { family: "SDXL", file: "your SDXL LoRAs", path: "loras/SDXL/styles", role: "LoRAs (any sub-folders)", need: "example", tasks: "Any SDXL task" },
  { key: "sdxlUnion", family: "SDXL", file: "controlnet-union-sdxl-1.0-promax.safetensors", display: "controlnet-union-sdxl-1.0-promax.safetensors (rename diffusion_pytorch_model_promax.safetensors)", path: "controlnet/SDXL", role: "ControlNet Union ProMax", need: "recommended", tasks: "Inpaint and Outpaint context, Pose, ControlNet (all types)", url: HF + "xinsir/controlnet-union-sdxl-1.0/resolve/main/diffusion_pytorch_model_promax.safetensors" },

  // ── Z-Image ──────────────────────────────────────────────────────────────────────────────
  { key: "zimageTurbo", family: "Z-Image", file: "z_image_turbo_bf16.safetensors", path: "diffusion_models/z-image/turbo", role: "Diffusion model (Turbo)", need: "required", tasks: "All Z-Image tasks", url: HF + "Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors" },
  { family: "Z-Image", file: "z_image_turbo_int8_convrot.safetensors", path: "diffusion_models/z-image/turbo", role: "Diffusion model (Turbo, int8)", need: "alternative", tasks: "Smaller / faster Turbo", url: HF + "Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_int8_convrot.safetensors" },
  { family: "Z-Image", file: "z_image_bf16.safetensors", path: "diffusion_models/z-image/regular", role: "Diffusion model (Base)", need: "optional", tasks: "25 steps · CFG 4 preset, real negative prompt", url: HF + "Comfy-Org/z_image/resolve/main/split_files/diffusion_models/z_image_bf16.safetensors" },
  { key: "zimageClip", family: "Z-Image", file: "qwen_3_4b.safetensors", path: "text_encoders", role: "Text encoder (Qwen3 4B)", need: "required", tasks: "All Z-Image tasks", url: HF + "Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors" },
  { family: "Z-Image", file: "qwen_3_4b_fp8_mixed.safetensors", path: "text_encoders", role: "Text encoder (fp8)", need: "alternative", tasks: "Less VRAM", url: HF + "Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b_fp8_mixed.safetensors" },
  { key: "zimageVae", family: "Z-Image", file: "ae.safetensors", path: "vae", role: "VAE", need: "required", tasks: "All Z-Image tasks", url: HF + "Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors" },
  { family: "Z-Image", file: "your Z-Image LoRAs", path: "loras/z-image/people", role: "LoRAs (any sub-folders)", need: "example", tasks: "Any Z-Image task" },
  { key: "zimageUnion", family: "Z-Image", file: "Z-Image-Turbo-Fun-Controlnet-Union.safetensors", path: "model_patches", role: "Fun ControlNet Union", need: "recommended", tasks: "Pose, ControlNet (canny, HED, depth, pose, M-LSD)", url: HF + "alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors" },
  { key: "zimageUnion21", family: "Z-Image", file: "Z-Image-Turbo-Fun-Controlnet-Union-2.1-2601-8steps.safetensors", display: "Z-Image-Turbo-Fun-Controlnet-Union-2.1 (8 steps)", path: "model_patches", role: "Fun ControlNet Union 2.1", need: "optional", tasks: "Adds context-aware Inpaint / Outpaint; also does all ControlNet types", url: HF + "alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1" },

  // ── Krea 2 ───────────────────────────────────────────────────────────────────────────────
  { key: "krea2Turbo", family: "Krea 2", file: "krea2_turbo_fp8_scaled.safetensors", path: "diffusion_models/krea2/turbo", role: "Diffusion model (Turbo)", need: "required", tasks: "All Krea 2 tasks", url: HF + "Comfy-Org/Krea-2/resolve/main/diffusion_models/krea2_turbo_fp8_scaled.safetensors" },
  { family: "Krea 2", file: "krea2_turbo_int8_convrot.safetensors", path: "diffusion_models/krea2/turbo", role: "Diffusion model (Turbo, int8)", need: "alternative", tasks: "Better than fp8 and often faster", url: HF + "Comfy-Org/Krea-2/resolve/main/diffusion_models/krea2_turbo_int8_convrot.safetensors" },
  { family: "Krea 2", file: "your Krea 2 RAW model", path: "diffusion_models/krea2/regular", role: "Diffusion model (RAW, undistilled)", need: "example", tasks: "52 steps · CFG 4 preset" },
  { key: "krea2Clip", family: "Krea 2", file: "qwen3vl_4b_fp8_scaled.safetensors", path: "text_encoders", role: "Text encoder (Qwen3-VL 4B)", need: "required", tasks: "All Krea 2 tasks", url: HF + "Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors" },
  { family: "Krea 2", file: "qwen_image_vae.safetensors", path: "vae", role: "VAE (the same file as Anima)", need: "required", tasks: "All Krea 2 tasks", url: HF + "Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors", duplicate: true },
  { key: "krea2Style", family: "Krea 2", file: "krea2_style_reference.safetensors", path: "loras/krea2", role: "Style reference LoRA", need: "optional", tasks: "Text to Image → Style reference", url: HF + "Comfy-Org/Krea-2/resolve/main/loras/krea2_style_reference.safetensors" },
  { key: "krea2Edit", family: "Krea 2", file: "krea2_identity_edit_v1_2.safetensors", path: "loras/krea2", role: "Identity Edit LoRA", need: "optional", tasks: "Smart Edit (with the comfyui-krea2edit nodes)", url: "https://github.com/lbouaraba/comfyui-krea2edit" },
  { key: "krea2Depth", family: "Krea 2", file: "your Krea 2 depth Control-LoRA, any file name", display: "Krea 2 depth Control LoRA", path: "loras/krea2/control", role: "Depth Control-LoRA", need: "optional", tasks: "ControlNet: depth, Pose (with comfyui-krea2-controlnet)", url: HF + "Patil/Krea-2-depth-controlnet" },
  { family: "Krea 2", file: "krea2_darkbrush.safetensors", path: "loras/krea2/styles", role: "Example style LoRA", need: "example", tasks: "Any Krea 2 task", url: HF + "Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors" },

  // ── Shared helpers ───────────────────────────────────────────────────────────────────────
  { key: "upscaler", family: "Shared", file: "RealESRGAN_x4plus.safetensors", path: "upscale_models", role: "Upscale model", need: "required", tasks: "Upscale (all families)", url: HF + "Comfy-Org/Real-ESRGAN_repackaged/resolve/main/RealESRGAN_x4plus.safetensors" },
  { key: "faceDetector", family: "Shared", file: "face_yolov8m.pt", path: "ultralytics/bbox", role: "Face detector (Impact Subpack)", need: "required", tasks: "Face Fix, Face Swap blend", url: HF + "Bingsu/adetailer/resolve/main/face_yolov8m.pt" },
  { key: "handDetector", family: "Shared", file: "hand_yolov8s.pt", path: "ultralytics/bbox", role: "Hand detector (Impact Subpack)", need: "required", tasks: "Hand Fix", url: HF + "Bingsu/adetailer/resolve/main/hand_yolov8s.pt" },
  { family: "Shared", file: "your eyes / lips detectors, e.g. Eyes.pt", path: "ultralytics/bbox", role: "Extra detectors", need: "example", tasks: "Face Fix → Eyes / Lips" },
  { key: "inswapper", family: "Shared", file: "inswapper_128.onnx", path: "insightface", role: "Face swap model (ReActor)", need: "required", tasks: "Face Swap", url: "https://github.com/Gourieff/ComfyUI-ReActor#installation" },
  { family: "Shared", file: "codeformer-v0.1.0.pth", path: "facerestore_models", role: "Face restore (ReActor)", need: "recommended", tasks: "Face Swap → Face restore", url: "https://github.com/Gourieff/ComfyUI-ReActor#installation" },
  { family: "Shared", file: "GFPGANv1.4.pth", path: "facerestore_models", role: "Face restore (ReActor)", need: "optional", tasks: "Face Swap → Face restore", url: "https://github.com/Gourieff/ComfyUI-ReActor#installation" },
];

// ComfyUI's own model folders that Wire Studio does not use (shown in the sample tree so the
// layout matches what you see on disk), and folders custom node packs fill by themselves.
export const OTHER_FOLDERS = [
  { path: "unet", note: "older name for diffusion_models (also read)" },
  { path: "clip", note: "older name for text_encoders (also read)" },
  { path: "clip_vision", note: "not used by Wire Studio" },
  { path: "embeddings", note: "not used by Wire Studio" },
  { path: "style_models", note: "not used by Wire Studio" },
  { path: "hypernetworks", note: "not used by Wire Studio" },
  { path: "gligen", note: "not used by Wire Studio" },
  { path: "photomaker", note: "not used by Wire Studio" },
  { path: "diffusers", note: "not used by Wire Studio" },
  { path: "vae_approx", note: "live-preview decoders (TAESD), optional" },
  { path: "configs", note: "not used by Wire Studio" },
];
export const AUTO_FOLDERS = [
  { what: "Pose / depth / line-art preprocessors", where: "custom_nodes/comfyui_controlnet_aux/ckpts/", by: "comfyui_controlnet_aux, on first use" },
  { what: "Background removal (BiRefNet)", where: "models/RMBG/", by: "ComfyUI-RMBG, on first use" },
  { what: "Face analysis for face swap (buffalo_l)", where: "models/insightface/models/", by: "ReActor, on first use" },
];
