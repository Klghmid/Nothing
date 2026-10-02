// A realistic ComfyUI /object_info for tests and the mock server. Input names follow the
// real nodes (core ComfyUI, Impact Pack, ReActor, controlnet_aux, RMBG, inpaint-nodes,
// UltimateSDUpscale, comfyui-krea2-controlnet, comfyui-krea2edit).
const L = (type) => [type];
const I = (def, min = 0, max = 16384) => ["INT", { default: def, min, max }];
const F = (def, min = 0, max = 100, step = 0.01) => ["FLOAT", { default: def, min, max, step }];
const B = (def) => ["BOOLEAN", { default: def }];
const S = (def = "", multiline = false) => ["STRING", { default: def, multiline }];
const C = (list, def) => [list, def === undefined ? {} : { default: def }];
const N = (list) => ["COMBO", { options: list, default: list[0] }]; // newer combo format
const node = (required, optional = {}, output = []) => ({ input: { required, optional }, output, output_name: output });

export const FILES = {
  checkpoints: ["Illustrious-XL-v2.0.safetensors", "SDXL/juggernautXL_v9.safetensors", "noobaiXLNAIXL_vPred10.safetensors", "sdpose_wholebody_fp16.safetensors", "sd15/dreamshaper_8.safetensors", "mystery_mix_v3.safetensors", "sd_xl_refiner_1.0.safetensors", "SDXL/turbo/dreamshaperMix_v8.safetensors", "Z-Image/turbo/z_image_turbo_aio.safetensors"],
  unets: ["anima-base-v1.0.safetensors", "Anima/anima_turbo_int8.safetensors", "z_image_turbo_bf16.safetensors", "z_image_bf16.safetensors", "krea2_turbo_fp8_scaled.safetensors", "krea2_raw_bf16.safetensors", "flux1-krea-dev.safetensors", "wan2.2_t2v_14B.safetensors", "z-image/regular/my_finetune.safetensors", "Anima_Turbo/terraRisingUnity_v301.safetensors"],
  loras: [
    "anima-turbo-lora-v0.2.safetensors",
    "Anima/ANIMA_DETAILER_zoda_anima_v2.safetensors",
    "Illustrious/SDXL_AddMicroDetails_Illustrious_v6.safetensors",
    "sdxl/pixel-art-xl.safetensors",
    "zimage/realism_zit_v1.safetensors",
    "krea2_darkbrush.safetensors",
    "krea2_style_reference.safetensors",
    "krea2/krea2_depth_control_lora.safetensors",
    "krea2_identity_edit_v1_2.safetensors",
    "detail_slider.safetensors",
    "anima/characters/miku_v3.safetensors",
    "AnimaLoRA/style_x.safetensors",
    "SDXL/styles/watercolor.safetensors",
    "z-image/people/portrait_v2.safetensors",
    "FLUX/flux_realism_lora.safetensors",
    "Wan2.2/lightx2v_i2v_14B.safetensors",
  ],
  clips: ["qwen_3_06b_base.safetensors", "qwen_3_4b.safetensors", "qwen3vl_4b_fp8_scaled.safetensors", "clip_l.safetensors", "t5xxl_fp8_e4m3fn.safetensors"],
  vaes: ["qwen_image_vae.safetensors", "ae.safetensors", "sdxl_vae.safetensors"],
  patches: ["anima-lllite-inpainting-v2.safetensors", "anima-lllite-any-test-like-v2.safetensors", "anima-lllite-depth-1.safetensors", "anima-lllite-pose-1.safetensors", "Z-Image-Turbo-Fun-Controlnet-Union.safetensors", "Z-Image-Turbo-Fun-Controlnet-Union-2.1-2601-8steps.safetensors"],
  controlnets: ["SDXL/controlnet-union-sdxl-1.0-promax.safetensors", "control_v11p_sd15_openpose.pth", "sdxl/diffusers_xl_canny_full.safetensors"],
  upscalers: ["RealESRGAN_x4plus.safetensors", "4x-AnimeSharp.pth"],
  detectors: ["bbox/face_yolov8m.pt", "bbox/hand_yolov8s.pt", "bbox/Eyes.pt", "segm/person_yolov8m-seg.pt"],
  inputs: ["example.png"],
};
const SAMPLERS = ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_2m_sde", "res_multistep", "er_sde", "uni_pc"];
const SCHEDULERS = ["normal", "karras", "exponential", "simple", "beta", "sgm_uniform"];
const ONOFF = ["enable", "disable"];

export function objectInfo(files = FILES, { without = [] } = {}) {
  const info = {
    CheckpointLoaderSimple: node({ ckpt_name: C(files.checkpoints) }, {}, ["MODEL", "CLIP", "VAE"]),
    UNETLoader: node({ unet_name: C(files.unets), weight_dtype: C(["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]) }, {}, ["MODEL"]),
    CLIPLoader: node({ clip_name: C(files.clips), type: C(["stable_diffusion", "stable_cascade", "sd3", "lumina2", "wan", "hidream", "chroma", "qwen_image", "flux2", "krea2"]) }, { device: C(["default", "cpu"]) }, ["CLIP"]),
    VAELoader: node({ vae_name: C(files.vaes) }, {}, ["VAE"]),
    LoraLoader: node({ model: L("MODEL"), clip: L("CLIP"), lora_name: C(files.loras), strength_model: F(1, -100, 100), strength_clip: F(1, -100, 100) }, {}, ["MODEL", "CLIP"]),
    LoraLoaderModelOnly: node({ model: L("MODEL"), lora_name: C(files.loras), strength_model: F(1, -100, 100) }, {}, ["MODEL"]),
    CLIPTextEncode: node({ text: S("", true), clip: L("CLIP") }, {}, ["CONDITIONING"]),
    ConditioningZeroOut: node({ conditioning: L("CONDITIONING") }, {}, ["CONDITIONING"]),
    EmptyLatentImage: node({ width: I(512, 16), height: I(512, 16), batch_size: I(1, 1, 4096) }, {}, ["LATENT"]),
    EmptySD3LatentImage: node({ width: I(1024, 16), height: I(1024, 16), batch_size: I(1, 1, 4096) }, {}, ["LATENT"]),
    KSampler: node(
      { model: L("MODEL"), seed: I(0, 0, Number.MAX_SAFE_INTEGER), steps: I(20, 1, 10000), cfg: F(8, 0, 100), sampler_name: C(SAMPLERS), scheduler: C(SCHEDULERS), positive: L("CONDITIONING"), negative: L("CONDITIONING"), latent_image: L("LATENT"), denoise: F(1, 0, 1) },
      {},
      ["LATENT"],
    ),
    VAEEncode: node({ pixels: L("IMAGE"), vae: L("VAE") }, {}, ["LATENT"]),
    VAEDecode: node({ samples: L("LATENT"), vae: L("VAE") }, {}, ["IMAGE"]),
    VAEEncodeForInpaint: node({ pixels: L("IMAGE"), vae: L("VAE"), mask: L("MASK"), grow_mask_by: I(6, 0, 64) }, {}, ["LATENT"]),
    SetLatentNoiseMask: node({ samples: L("LATENT"), mask: L("MASK") }, {}, ["LATENT"]),
    RepeatLatentBatch: node({ samples: L("LATENT"), amount: I(1, 1, 64) }, {}, ["LATENT"]),
    LoadImage: node({ image: [files.inputs, { image_upload: true }] }, {}, ["IMAGE", "MASK"]),
    SaveImage: node({ images: L("IMAGE"), filename_prefix: S("ComfyUI") }),
    ImageToMask: node({ image: L("IMAGE"), channel: C(["red", "green", "blue", "alpha"]) }, {}, ["MASK"]),
    MaskToImage: node({ mask: L("MASK") }, {}, ["IMAGE"]),
    ImageBlur: node({ image: L("IMAGE"), blur_radius: I(1, 1, 31), sigma: F(1, 0.1, 10) }, {}, ["IMAGE"]),
    ThresholdMask: node({ mask: L("MASK"), value: F(0.5, 0, 1) }, {}, ["MASK"]),
    ImageCompositeMasked: node({ destination: L("IMAGE"), source: L("IMAGE"), x: I(0), y: I(0), resize_source: B(false) }, { mask: L("MASK") }, ["IMAGE"]),
    ImagePadForOutpaint: node({ image: L("IMAGE"), left: I(0), top: I(0), right: I(0), bottom: I(0), feathering: I(40) }, {}, ["IMAGE", "MASK"]),
    ImageScale: node({ image: L("IMAGE"), upscale_method: C(["nearest-exact", "bilinear", "area", "bicubic", "lanczos"]), width: I(512), height: I(512), crop: C(["disabled", "center"]) }, {}, ["IMAGE"]),
    ImageInvert: node({ image: L("IMAGE") }, {}, ["IMAGE"]),
    Canny: node({ image: L("IMAGE"), low_threshold: F(0.4, 0.01, 0.99), high_threshold: F(0.8, 0.01, 0.99) }, {}, ["IMAGE"]),
    UpscaleModelLoader: node({ model_name: C(files.upscalers) }, {}, ["UPSCALE_MODEL"]),
    ImageUpscaleWithModel: node({ upscale_model: L("UPSCALE_MODEL"), image: L("IMAGE") }, {}, ["IMAGE"]),
    ControlNetLoader: node({ control_net_name: C(files.controlnets) }, {}, ["CONTROL_NET"]),
    ControlNetApplyAdvanced: node(
      { positive: L("CONDITIONING"), negative: L("CONDITIONING"), control_net: L("CONTROL_NET"), image: L("IMAGE"), strength: F(1, 0, 10), start_percent: F(0, 0, 1), end_percent: F(1, 0, 1) },
      { vae: L("VAE") },
      ["CONDITIONING", "CONDITIONING"],
    ),
    SetUnionControlNetType: node({ control_net: L("CONTROL_NET"), type: C(["auto", "openpose", "depth", "hed/pidi/scribble/ted", "canny/lineart/anime_lineart/mlsd", "normal", "segment", "tile", "repaint"]) }, {}, ["CONTROL_NET"]),
    EmptyImage: node({ width: I(512, 1), height: I(512, 1), batch_size: I(1, 1, 4096), color: I(0, 0, 0xffffff) }, {}, ["IMAGE"]),
    ModelPatchLoader: node({ name: C(files.patches) }, {}, ["MODEL_PATCH"]),
    AnimaLLLiteApply: node({ model: L("MODEL"), model_patch: L("MODEL_PATCH"), image: L("IMAGE"), strength: F(1, -10, 10), start_percent: F(0, 0, 1), end_percent: F(1, 0, 1) }, { mask: L("MASK") }, ["MODEL"]),
    QwenImageDiffsynthControlnet: node({ model: L("MODEL"), model_patch: L("MODEL_PATCH"), vae: L("VAE"), image: L("IMAGE"), strength: F(1, -10, 10) }, { mask: L("MASK"), start_percent: F(0, 0, 1), end_percent: F(1, 0, 1) }, ["MODEL"]),
    ZImageFunControlnet: node({ model: L("MODEL"), model_patch: L("MODEL_PATCH"), vae: L("VAE"), strength: F(1, -10, 10) }, { image: L("IMAGE"), inpaint_image: L("IMAGE"), mask: L("MASK"), start_percent: F(0, 0, 1), end_percent: F(1, 0, 1) }, ["MODEL"]),
    ModelSamplingAuraFlow: node({ model: L("MODEL"), shift: F(1.73, 0, 100) }, { sampling: C(["flow", "img_to_img_velocity"], "flow") }, ["MODEL"]),
    ModelSamplingFlux: node({ model: L("MODEL"), max_shift: F(1.15, 0, 100), base_shift: F(0.5, 0, 100), width: I(1024, 16), height: I(1024, 16) }, {}, ["MODEL"]),
    DifferentialDiffusion: node({ model: L("MODEL") }, { strength: F(1, 0, 1) }, ["MODEL"]),
    TextEncodeQwenImageEditPlus: node({ clip: L("CLIP"), prompt: S("", true) }, { vae: L("VAE"), image1: L("IMAGE"), image2: L("IMAGE"), image3: L("IMAGE") }, ["CONDITIONING"]),
    FluxKontextMultiReferenceLatentMethod: node({ conditioning: L("CONDITIONING"), reference_latents_method: N(["offset", "index", "uxo/uno", "index_timestep_zero"]) }, {}, ["CONDITIONING"]),
    // Impact Pack / Subpack
    UltralyticsDetectorProvider: node({ model_name: C(files.detectors) }, {}, ["BBOX_DETECTOR", "SEGM_DETECTOR"]),
    FaceDetailer: node(
      {
        image: L("IMAGE"), model: L("MODEL"), clip: L("CLIP"), vae: L("VAE"),
        guide_size: F(512, 64, 8192), guide_size_for: B(true), max_size: F(1024, 64, 8192),
        seed: I(0, 0, Number.MAX_SAFE_INTEGER), steps: I(20, 1, 10000), cfg: F(8, 0, 100),
        sampler_name: C(SAMPLERS), scheduler: C([...SCHEDULERS, "AYS SDXL", "GITS[coeff=1.2]"]),
        positive: L("CONDITIONING"), negative: L("CONDITIONING"), denoise: F(0.5, 0.0001, 1),
        feather: I(5, 0, 100), noise_mask: B(true), force_inpaint: B(true),
        bbox_threshold: F(0.5, 0, 1), bbox_dilation: I(10, -512, 512), bbox_crop_factor: F(3, 1, 10),
        sam_detection_hint: C(["center-1", "horizontal-2", "vertical-2", "none"]), sam_dilation: I(0, -512, 512), sam_threshold: F(0.93, 0, 1),
        sam_bbox_expansion: I(0, 0, 1000), sam_mask_hint_threshold: F(0.7, 0, 1), sam_mask_hint_use_negative: C(["False", "Small", "Outter"]),
        drop_size: I(10, 1, 16384), bbox_detector: L("BBOX_DETECTOR"), wildcard: S("", true), cycle: I(1, 1, 10),
      },
      { sam_model_opt: L("SAM_MODEL"), segm_detector_opt: L("SEGM_DETECTOR"), detailer_hook: L("DETAILER_HOOK"), inpaint_model: B(false), noise_mask_feather: I(20, 0, 100), scheduler_func_opt: L("SCHEDULER_FUNC"), tiled_encode: B(false), tiled_decode: B(false) },
      ["IMAGE", "IMAGE", "IMAGE", "MASK", "DETAILER_PIPE", "IMAGE"],
    ),
    // ReActor
    ReActorFaceSwap: node(
      {
        enabled: B(true), input_image: L("IMAGE"), swap_model: C(["inswapper_128.onnx"]), facedetection: C(["retinaface_resnet50", "retinaface_mobile0.25", "YOLOv5l", "YOLOv5n"]),
        face_restore_model: C(["none", "codeformer-v0.1.0.pth", "GFPGANv1.4.pth"]), face_restore_visibility: F(1, 0.1, 1), codeformer_weight: F(0.5, 0, 1),
        detect_gender_input: C(["no", "female", "male"], "no"), detect_gender_source: C(["no", "female", "male"], "no"),
        input_faces_index: S("0"), source_faces_index: S("0"), console_log_level: C([0, 1, 2], 1),
      },
      { source_image: L("IMAGE"), face_model: L("FACE_MODEL"), face_boost: L("FACE_BOOST") },
      ["IMAGE", "FACE_MODEL", "IMAGE"],
    ),
    // comfyui_controlnet_aux
    DWPreprocessor: node({ image: L("IMAGE") }, { detect_hand: C(ONOFF), detect_body: C(ONOFF), detect_face: C(ONOFF), resolution: I(512, 64), bbox_detector: C(["yolox_l.onnx"]), pose_estimator: C(["dw-ll_ucoco_384_bs5.torchscript.pt"]), scale_stick_for_xinsr_cn: C(["disable", "enable"]) }, ["IMAGE", "POSE_KEYPOINT"]),
    DepthAnythingV2Preprocessor: node({ image: L("IMAGE") }, { ckpt_name: C(["depth_anything_v2_vitl.pth", "depth_anything_v2_vits.pth"]), resolution: I(512, 64) }, ["IMAGE"]),
    LineArtPreprocessor: node({ image: L("IMAGE") }, { coarse: C(["disable", "enable"]), resolution: I(512, 64) }, ["IMAGE"]),
    AnimeLineArtPreprocessor: node({ image: L("IMAGE") }, { resolution: I(512, 64) }, ["IMAGE"]),
    HEDPreprocessor: node({ image: L("IMAGE") }, { safe: C(ONOFF), resolution: I(512, 64) }, ["IMAGE"]),
    PiDiNetPreprocessor: node({ image: L("IMAGE") }, { safe: C(ONOFF), resolution: I(512, 64) }, ["IMAGE"]),
    FakeScribblePreprocessor: node({ image: L("IMAGE") }, { safe: C(ONOFF), resolution: I(512, 64) }, ["IMAGE"]),
    "M-LSDPreprocessor": node({ image: L("IMAGE") }, { score_threshold: F(0.1, 0.01, 2), dist_threshold: F(0.1, 0.01, 20), resolution: I(512, 64) }, ["IMAGE"]),
    // ComfyUI-RMBG
    BiRefNetRMBG: node({ image: L("IMAGE"), model: C(["BiRefNet-general", "BiRefNet-HR", "BiRefNet-portrait"]) }, { sensitivity: F(1, 0, 1), mask_blur: I(0, 0, 64), mask_offset: I(0, -20, 20), invert_output: B(false), refine_foreground: B(false), unload_model: B(false), background: C(["Alpha", "Color"]), background_color: ["COLORCODE", { default: "#222222" }] }, ["IMAGE", "MASK", "IMAGE"]),
    // comfyui-inpaint-nodes
    INPAINT_MaskedFill: node({ image: L("IMAGE"), mask: L("MASK"), fill: C(["neutral", "telea", "navier-stokes"]), falloff: I(0, 0, 8191) }, {}, ["IMAGE"]),
    // ComfyUI_UltimateSDUpscale
    UltimateSDUpscale: node(
      {
        image: L("IMAGE"), model: L("MODEL"), positive: L("CONDITIONING"), negative: L("CONDITIONING"), vae: L("VAE"), upscale_by: F(2, 0.05, 4),
        seed: I(0, 0, Number.MAX_SAFE_INTEGER), steps: I(20, 1, 10000), cfg: F(8, 0, 100), sampler_name: C(SAMPLERS), scheduler: C(SCHEDULERS), denoise: F(0.2, 0, 1),
        upscale_model: L("UPSCALE_MODEL"), mode_type: C(["Linear", "Chess", "None"]), batch_size: I(1, 1, 4096), tile_width: I(512, 64, 8192), tile_height: I(512, 64, 8192), mask_blur: I(8, 0, 64), tile_padding: I(32, 0, 8192),
        seam_fix_mode: C(["None", "Band Pass", "Half Tile", "Half Tile + Intersections"]), seam_fix_denoise: F(1, 0, 1), seam_fix_width: I(64, 0, 8192), seam_fix_mask_blur: I(8, 0, 64), seam_fix_padding: I(16, 0, 8192),
        force_uniform_tiles: B(true), tiled_decode: B(false),
      },
      {},
      ["IMAGE"],
    ),
    // comfyui-krea2-controlnet
    Krea2ControlLoRALoader: node({ model: L("MODEL"), lora_name: C(files.loras), strength: F(1, -100, 100) }, {}, ["MODEL"]),
    Krea2ControlApply: node({ model: L("MODEL"), control_latent: L("LATENT") }, {}, ["MODEL"]),
    Krea2ControlImageEncode: node(
      { control_image: L("IMAGE"), vae: L("VAE"), resize: C(["keep_control_image_size", "match_latent_size"], "match_latent_size"), upscale_method: C(["lanczos", "bicubic", "bilinear", "area", "nearest-exact"]), crop: C(["center", "disabled"]), channel_mode: C(["rgb", "grayscale"]), normalize: C(["none", "per_image_minmax"]), invert: B(false), batch_mode: C(["independent_images", "video_frames"]) },
      { latent: L("LATENT") },
      ["LATENT", "IMAGE"],
    ),
    // comfyui-krea2edit
    // comfyui-krea2edit v1.2.5 (every input but model / source_latent / clip / prompt is optional)
    Krea2EditModelPatch: node(
      { model: L("MODEL"), source_latent: L("LATENT") },
      { source_latent_b: L("LATENT"), ref_boost: F(1, 0, 1000), ref_boost_a: F(1, 0, 1000), fit_mode: C(["fit", "crop (legacy)"], "fit"), ref_boost_mask: L("MASK"), vae: L("VAE"), source_image: L("IMAGE"), source_image_b: L("IMAGE"), target_latent: L("LATENT") },
      ["MODEL"],
    ),
    Krea2EditGroundedEncode: node({ clip: L("CLIP"), prompt: S("", true) }, { image: L("IMAGE"), image_b: L("IMAGE"), grounding_px: I(768, 0, 4096), system_prompt: S("", true) }, ["CONDITIONING"]),
  };
  for (const n of without) delete info[n];
  return info;
}

export const CUSTOM_NODES = ["UltralyticsDetectorProvider", "FaceDetailer", "ReActorFaceSwap", "DWPreprocessor", "DepthAnythingV2Preprocessor", "LineArtPreprocessor", "AnimeLineArtPreprocessor", "HEDPreprocessor", "PiDiNetPreprocessor", "FakeScribblePreprocessor", "M-LSDPreprocessor", "BiRefNetRMBG", "INPAINT_MaskedFill", "UltimateSDUpscale", "Krea2ControlLoRALoader", "Krea2ControlApply", "Krea2ControlImageEncode", "Krea2EditModelPatch", "Krea2EditGroundedEncode"];

// Parameters that make every task buildable (image names are just strings for LoadImage).
export function sampleParams(task) {
  const base = { prompt: "test prompt", seed: 42, imageW: 832, imageH: 1216, width: 1024, height: 1024 };
  const byTask = {
    img2img: { image: "example.png", denoise: 0.5 },
    edit: { image: "example.png" },
    inpaint: { image: "example.png", mask: "mask.png" },
    outpaint: { image: "example.png", left: 128, right: 128 },
    face: { image: "example.png" },
    hands: { image: "example.png" },
    faceswap: { image: "example.png", face: "face.png" },
    pose: { image: "example.png" },
    control: { image: "example.png", kind: "depth" },
    upscale: { image: "example.png", scale: 2, refine: true },
  };
  return { ...base, ...(byTask[task] || {}) };
}
