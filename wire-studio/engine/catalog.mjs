import { MODEL_LIST } from "./model-list.mjs";

// What every workflow needs and where to get it. Model URLs marked "template" come from
// the `models` metadata of Comfy-Org's official workflow templates; repo links are used
// where a direct file link could not be verified.

export const PACKS = {
  impact: { name: "ComfyUI Impact Pack", url: "https://github.com/ltdrdata/ComfyUI-Impact-Pack" },
  impactSub: { name: "ComfyUI Impact Subpack", url: "https://github.com/ltdrdata/ComfyUI-Impact-Subpack" },
  aux: { name: "comfyui_controlnet_aux", url: "https://github.com/Fannovel16/comfyui_controlnet_aux" },
  reactor: { name: "ComfyUI-ReActor", url: "https://github.com/Gourieff/ComfyUI-ReActor" },
  rmbg: { name: "ComfyUI-RMBG", url: "https://github.com/1038lab/ComfyUI-RMBG" },
  inpaint: { name: "comfyui-inpaint-nodes", url: "https://github.com/Acly/comfyui-inpaint-nodes" },
  usdu: { name: "ComfyUI_UltimateSDUpscale", url: "https://github.com/ssitu/ComfyUI_UltimateSDUpscale" },
  krea2control: { name: "comfyui-krea2-controlnet", url: "https://github.com/facok/comfyui-krea2-controlnet" },
  krea2edit: { name: "comfyui-krea2edit", url: "https://github.com/lbouaraba/comfyui-krea2edit" },
  krea2unidepth: { name: "ComfyUI-Krea2-UniDepth", url: "https://github.com/cicalooo/ComfyUI-Krea2-UniDepth" },
  krea2ostris: { name: "ComfyUI-Krea2-Ostris-Edit", url: "https://github.com/ostris/ComfyUI-Krea2-Ostris-Edit" },
  core: { name: "a newer ComfyUI (update ComfyUI)", url: "https://github.com/Comfy-Org/ComfyUI" },
};

// Core ComfyUI nodes Wire Studio builds with (kept in the live node-definition snapshot).
export const CORE_NODES = [
  "CheckpointLoaderSimple", "UNETLoader", "CLIPLoader", "VAELoader", "LoraLoader", "LoraLoaderModelOnly",
  "CLIPTextEncode", "ConditioningZeroOut", "EmptyLatentImage", "EmptySD3LatentImage", "KSampler",
  "VAEEncode", "VAEDecode", "VAEEncodeForInpaint", "SetLatentNoiseMask", "RepeatLatentBatch",
  "LoadImage", "SaveImage", "ImageToMask", "MaskToImage", "ImageBlur", "ThresholdMask", "ImageCompositeMasked",
  "ImagePadForOutpaint", "ImageScale", "ImageInvert", "Canny", "UpscaleModelLoader", "ImageUpscaleWithModel",
  "ControlNetLoader", "ControlNetApplyAdvanced", "SetUnionControlNetType", "EmptyImage", "ModelPatchLoader",
  "AnimaLLLiteApply", "QwenImageDiffsynthControlnet", "ZImageFunControlnet", "ModelSamplingAuraFlow", "ModelSamplingFlux",
  "DifferentialDiffusion", "TextEncodeQwenImageEditPlus", "FluxKontextMultiReferenceLatentMethod",
  "LoadDA3Model", "DA3Inference", "DA3Render",
  "LoadBackgroundRemovalModel", "RemoveBackground", "InvertMask", "GrowMask", "MaskComposite", "JoinImageWithAlpha",
];

export const NODE_PACK = {
  FaceDetailer: "impact",
  BboxDetectorSEGS: "impact",
  SegsToCombinedMask: "impact",
  UltralyticsDetectorProvider: "impactSub",
  DWPreprocessor: "aux",
  OpenposePreprocessor: "aux",
  DepthAnythingV2Preprocessor: "aux",
  LineArtPreprocessor: "aux",
  AnimeLineArtPreprocessor: "aux",
  HEDPreprocessor: "aux",
  PiDiNetPreprocessor: "aux",
  FakeScribblePreprocessor: "aux",
  "M-LSDPreprocessor": "aux",
  ImageLuminanceDetector: "aux",
  ImageIntensityDetector: "aux",
  ReActorFaceSwap: "reactor",
  BiRefNetRMBG: "rmbg",
  RMBG: "rmbg",
  INPAINT_MaskedFill: "inpaint",
  UltimateSDUpscale: "usdu",
  Krea2ControlLoRALoader: "krea2control",
  Krea2ControlApply: "krea2control",
  Krea2ControlImageEncode: "krea2control",
  Krea2EditModelPatch: "krea2edit",
  Krea2EditGroundedEncode: "krea2edit",
  Krea2UniDepthLoRALoader: "krea2unidepth",
  Krea2UniDepthConditioning: "krea2unidepth",
  Krea2UniDepthReferenceStack: "krea2unidepth",
  Krea2OstrisEditModelPatch: "krea2ostris",
  TextEncodeKrea2OstrisEdit: "krea2ostris",
};
export const packOf = (type) => PACKS[NODE_PACK[type] || "core"];

// Model files Setup can ask for, with their default folder and download link, taken from the
// single list in model-list.mjs (which also generates the ComfyUI models guide).
export const MODELS = Object.fromEntries(MODEL_LIST.filter((m) => m.key).map((m) => [m.key, { key: m.key, file: m.display || m.file, folder: m.path, url: m.url }]));

export const TASK_GROUPS = ["Create", "Edit", "Identity Edit", "Fix", "Control", "Finish"];

// Task metadata shared by every family (each family decides if and how it runs a task).
export const TASKS = {
  generate: { label: "Text to Image", group: "Create", icon: "sparkles", run: "Generate", about: "Create a new image from a prompt." },
  style: { label: "Style Reference", group: "Create", icon: "palette", run: "Generate", about: "Make a picture in the look of one to three reference images." },
  img2img: { label: "Image to Image", group: "Create", icon: "layers", run: "Redraw", about: "Redraw an existing image; strength decides how much changes." },
  edit: { label: "Smart Edit", group: "Identity Edit", icon: "wand", run: "Apply edit", about: "Describe a change in words; the subject's identity is kept." },
  "k2-remove": { label: "Object Remove", group: "Identity Edit", icon: "eraser", run: "Remove", about: "Remove an object or person; the rest of the picture is kept." },
  "k2-replace": { label: "Object Replace", group: "Identity Edit", icon: "swap", run: "Replace", about: "Replace one object with another, described or from a photo." },
  "k2-background": { label: "Background Swap", group: "Identity Edit", icon: "image", run: "Swap background", about: "Put the subject in front of a new background, described or from a photo." },
  "k2-person": { label: "Person Replace", group: "Identity Edit", icon: "face", run: "Replace person", about: "Replace a person in a scene, keeping the pose and framing." },
  "k2-insert": { label: "Insert Person", group: "Identity Edit", icon: "plus", run: "Insert", about: "Place a person from one photo into another scene." },
  "k2-face": { label: "Face Replace", group: "Identity Edit", icon: "face", run: "Replace face", about: "Give a picture the face of the identity photo; hair, body and scene stay." },
  "k2-head": { label: "Head Replace", group: "Identity Edit", icon: "face", run: "Replace head", about: "Replace the whole head (face and hair) with the one in a photo." },
  "k2-eyes": { label: "Eye Replace", group: "Identity Edit", icon: "eye", run: "Replace eyes", about: "Change only the eyes, described or from a reference photo." },
  "k2-outfit": { label: "Outfit Change", group: "Identity Edit", icon: "layers", run: "Change outfit", about: "Dress the person differently; face and pose are kept." },
  "k2-tryon": { label: "Virtual Try-On", group: "Identity Edit", icon: "layers", run: "Try on", about: "Put a garment from a photo onto the person." },
  "k2-inpaint": { label: "Identity Inpaint", group: "Identity Edit", icon: "brush", run: "Inpaint", about: "Change a painted area by instruction; everything else stays pixel-identical." },
  "k2-outpaint": { label: "Identity Outpaint", group: "Identity Edit", icon: "expand", run: "Extend", about: "Extend the canvas while the picture keeps its look." },
  "k2-reframe": { label: "Identity Reframe", group: "Identity Edit", icon: "expand", run: "Reframe", about: "Change the aspect ratio by extending the picture, keeping its look." },
  "k2-variation": { label: "Character Variation", group: "Identity Edit", icon: "sparkles", run: "Make variations", about: "Variations of a character with more creative freedom." },
  "k2-restage": { label: "Character Restage", group: "Identity Edit", icon: "sparkles", run: "Restage", about: "The same person in a new scene, relit, with a new camera angle." },
  "k2-sheet": { label: "Character Sheet", group: "Identity Edit", icon: "grid", run: "Make sheet", about: "A reference sheet of a character: views or expressions." },
  "k2-scene": { label: "Scene Change", group: "Identity Edit", icon: "image", run: "Change scene", about: "Change the setting and its light while keeping the people." },
  "k2-pose": { label: "Pose Restage", group: "Identity Edit", icon: "pose", run: "Restage pose", about: "Put the character in a new pose, described or from a photo." },
  inpaint: { label: "Inpaint", group: "Edit", icon: "brush", run: "Inpaint", about: "Paint over an area and describe what should be there." },
  outpaint: { label: "Outpaint", group: "Edit", icon: "expand", run: "Extend", about: "Extend the canvas beyond its borders." },
  reframe: { label: "Reframe", group: "Edit", icon: "expand", run: "Reframe", about: "Change the shape of a picture (aspect ratio or exact size) by extending it." },
  "bg-replace": { label: "Background Replace", group: "Edit", icon: "image", run: "Replace background", about: "Keep the subject and put a new background behind it: described, from a photo, or blurred." },
  face: { label: "Face Fix", group: "Fix", icon: "face", run: "Fix face", about: "Find faces (or eyes / lips) and redraw them in more detail." },
  hands: { label: "Hand Fix", group: "Fix", icon: "hand", run: "Fix hands", about: "Find hands and redraw them at higher detail." },
  faceswap: { label: "Face Swap", group: "Fix", icon: "swap", run: "Swap face", about: "Put a face from a photo onto an image, then blend it in with this model." },
  pose: { label: "Pose", group: "Control", icon: "pose", run: "Generate in pose", about: "Make a new image that copies the pose of a reference." },
  control: { label: "ControlNet", group: "Control", icon: "grid", run: "Generate", about: "Guide a new image with edges, line art, depth or a pose map." },
  "img2img-control": { label: "Img2Img + Control", group: "Control", icon: "layers", run: "Redraw", about: "Redraw an image while a control map keeps its structure (lines, depth, pose…)." },
  upscale: { label: "Upscale", group: "Finish", icon: "zoom", run: "Upscale", about: "Enlarge with an upscale model and optionally re-add detail." },
};

export const ASPECTS = [
  { id: "1:1", w: 1024, h: 1024 },
  { id: "3:4", w: 896, h: 1152 },
  { id: "4:3", w: 1152, h: 896 },
  { id: "2:3", w: 832, h: 1216 },
  { id: "3:2", w: 1216, h: 832 },
  { id: "9:16", w: 768, h: 1344 },
  { id: "16:9", w: 1344, h: 768 },
];

// Labels for control map kinds (each family lists the ones its control model was trained on).
export const CONTROL_KINDS = {
  canny: "Canny edges",
  lineart: "Line art",
  scribble: "Scribble / soft edge",
  hed: "Soft edge (HED)",
  depth: "Depth",
  pose: "Pose (skeleton)",
  mlsd: "Straight lines (M-LSD)",
  gray: "Grayscale (tones)",
};
