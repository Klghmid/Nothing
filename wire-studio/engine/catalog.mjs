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
  core: { name: "a newer ComfyUI (update ComfyUI)", url: "https://github.com/Comfy-Org/ComfyUI" },
};

const NODE_PACK = {
  FaceDetailer: "impact",
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
};
export const packOf = (type) => PACKS[NODE_PACK[type] || "core"];

// Model files Setup can ask for, with their default folder and download link, taken from the
// single list in model-list.mjs (which also generates the ComfyUI models guide).
export const MODELS = Object.fromEntries(MODEL_LIST.filter((m) => m.key).map((m) => [m.key, { file: m.display || m.file, folder: m.path, url: m.url }]));

export const TASK_GROUPS = ["Create", "Edit", "Fix", "Control", "Finish"];

// Task metadata shared by every family (each family decides if and how it runs a task).
export const TASKS = {
  generate: { label: "Text to Image", group: "Create", icon: "sparkles", run: "Generate", about: "Create a new image from a prompt." },
  img2img: { label: "Image to Image", group: "Create", icon: "layers", run: "Redraw", about: "Redraw an existing image; strength decides how much changes." },
  edit: { label: "Smart Edit", group: "Edit", icon: "wand", run: "Apply edit", about: "Describe a change in words; the subject's identity is kept." },
  inpaint: { label: "Inpaint", group: "Edit", icon: "brush", run: "Inpaint", about: "Paint over an area and describe what should be there." },
  outpaint: { label: "Outpaint", group: "Edit", icon: "expand", run: "Extend", about: "Extend the canvas beyond its borders." },
  face: { label: "Face Fix", group: "Fix", icon: "face", run: "Fix face", about: "Find faces (or eyes / lips) and redraw them in more detail." },
  hands: { label: "Hand Fix", group: "Fix", icon: "hand", run: "Fix hands", about: "Find hands and redraw them at higher detail." },
  faceswap: { label: "Face Swap", group: "Fix", icon: "swap", run: "Swap face", about: "Put a face from a photo onto an image, then blend it in with this model." },
  pose: { label: "Pose", group: "Control", icon: "pose", run: "Generate in pose", about: "Make a new image that copies the pose of a reference." },
  control: { label: "ControlNet", group: "Control", icon: "grid", run: "Generate", about: "Guide a new image with edges, line art, depth or a pose map." },
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
};
