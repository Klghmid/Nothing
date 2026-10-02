// Reads what is installed on the connected ComfyUI and sorts every model and LoRA into
// exactly one family, so a family's workflows can never load another family's weights.
//
// Family — order of evidence: your own assignment in the Library > the first folder (at any
// depth) named after a family > the file name. So `loras/SDXL/characters/x.safetensors`,
// `loras/anima/styles/2025/x.safetensors` and `diffusion_models/z-image/turbo/x.safetensors`
// are sorted by their family folder, whatever the file is called.
//
// Variant — a `turbo/` (lightning, hyper, dmd2, lcm, distilled) or `regular/` (base, raw,
// standard, full) folder anywhere in the path decides; otherwise the file name does
// ("turbo", "lightning"… → turbo, else regular). The variant picks the sampling preset.
// Krea 2 task LoRAs have their own folders: loras/krea2/editor/ (Smart Edit) and
// loras/krea2/control/ (Control-LoRAs). See docs/MODEL-FOLDERS.md for the full layout.
import { options } from "./graph.mjs";

export const FAMILY_IDS = ["anima", "sdxl", "zimage", "krea2"];

// Other families, and non-diffusion checkpoints official templates also put in checkpoints/
// (SAM 3 segmentation, SDPose) — never offered as an SDXL model.
const OTHER = /(^|[^a-z])(sd[-_ ]?1[._-]?5|sd15|v1-5|sd[-_ ]?3|flux|sdpose|svd|cascade|hunyuan|wan2?|qwen|ltx|cosmos|kolors|lumina|hidream|chroma|aura|sam\d+(?:\.\d+)?|depth[-_ ]?anything|birefnet)([^a-z]|$)|refiner/i;
const tokens = (s) => s.split(/[^a-zA-Z0-9]+/).filter(Boolean);
const parts = (name) => String(name).replaceAll("\\", "/").split("/");
// "anima", "anima2", "AnimaLoRA", "anima_models", "anima-base…" — but not Animagine / animation / animal.
const ANIMA_TOKEN = /^anima(\d|$|loras?$|models?$|base|turbo|preview|lllite|v\d)/i;

function byName(text) {
  if (/krea[-_ ]?2/i.test(text) && !/flux/i.test(text)) return "krea2";
  if (/z[-_ ]?image|zimage|(^|[^a-z])zit[-_]/i.test(text)) return "zimage";
  if (tokens(text).some((t) => ANIMA_TOKEN.test(t))) return "anima";
  if (/xl|illustrious|noob|pony|animagine/i.test(text) && !OTHER.test(text)) return "sdxl";
  if (OTHER.test(text)) return "other";
  return null;
}

export function classify(name, overrides = {}) {
  if (overrides[name]) return overrides[name];
  const p = parts(name);
  for (const folder of p.slice(0, -1)) {
    const f = byName(folder);
    if (f) return f;
  }
  return byName(p.at(-1)) || "unknown";
}

const TURBO_WORD = /^(turbo|lightning|hyper|dmd2?|lcm|distill(ed)?|fast|few[-_ ]?steps?|schnell)$/i;
const REGULAR_WORD = /^(regular|base|raw|standard|normal|full|non[-_ ]?turbo|undistilled|dev)$/i;
export function variantOf(name) {
  const p = parts(name);
  // The deepest turbo/regular folder wins (whole name or a word of it: "turbo", "Anima_Turbo",
  // "SDXL-Lightning", "z-image base"), then the file name.
  for (const folder of p.slice(0, -1).reverse()) {
    const words = [folder, ...tokens(folder)];
    if (words.some((w) => TURBO_WORD.test(w))) return "turbo";
    if (words.some((w) => REGULAR_WORD.test(w))) return "regular";
  }
  return /turbo|lightning|hyper[-_ ]?sd|hyper|dmd2|(^|[^a-z])lcm([^a-z]|$)|distill/i.test(p.at(-1)) ? "turbo" : "regular";
}

const SDXL_NET_EXCLUDE = /sd15|sd1[._-]?5|v11[pfe]|control_v1|flux|qwen|z[-_]?image|anima|krea|wan|sd3/i;
const UNET_FAMILIES = ["anima", "zimage", "krea2"];
const variants = (list) => Object.fromEntries(list.map((n) => [n, variantOf(n)]));

export function readInventory(info = {}, overrides = {}) {
  const ckpts = options(info, "CheckpointLoaderSimple", "ckpt_name");
  const unets = options(info, "UNETLoader", "unet_name");
  const loras = [...new Set([...options(info, "LoraLoader", "lora_name"), ...options(info, "LoraLoaderModelOnly", "lora_name")])];
  const clips = options(info, "CLIPLoader", "clip_name");
  const vaes = options(info, "VAELoader", "vae_name");
  const patches = options(info, "ModelPatchLoader", "name");
  const fam = (list, id) => list.filter((n) => classify(n, overrides) === id);
  // Files no family claims ("unknown") need your decision; files of families Wire Studio does
  // not run (FLUX, SD 1.5, Qwen-Image, Wan…) are listed apart and never offered.
  const unsortedLoras = fam(loras, "unknown");
  const krea2Loras = fam(loras, "krea2");
  // Krea 2 task LoRAs, kept out of the LoRA picker: loras/krea2/editor/ (Smart Edit) and
  // loras/krea2/control/ (Control-LoRAs) take any file name; elsewhere the name must say it.
  const folders = (n) => parts(n).slice(0, -1);
  const inEditor = (n) => folders(n).some((f) => /^(editor|editors|edit|edits|editing)$/i.test(f));
  const isEditLora = (n) => /krea2[-_]?identity[-_]?edit/i.test(n) || (classify(n, overrides) === "krea2" && (inEditor(n) || /identity[-_]?edit/i.test(parts(n).pop())));
  const isControlLora = (n) => !isEditLora(n) && (/depth|control|canny|pose/i.test(parts(n).pop()) || folders(n).some((f) => /^control(net)?s?$/i.test(f))) && !/style|edit/i.test(n);
  // Several edit LoRAs: the one in editor/ wins, then the highest version.
  const editLoras = loras.filter(isEditLora).sort((a, b) => inEditor(a) - inEditor(b) || parts(a).pop().localeCompare(parts(b).pop(), "en", { numeric: true }));
  const sdxlModels = ckpts.filter((n) => ["sdxl", "unknown"].includes(classify(n, overrides)) && !/sdpose|inpaint.*sd15/i.test(n));
  const unetModels = Object.fromEntries(UNET_FAMILIES.map((id) => [id, fam(unets, id)]));
  // Anima / Z-Image / Krea 2 files are diffusion models (UNETLoader reads models/diffusion_models
  // and models/unet). Found only under checkpoints/, they cannot be loaded: report them.
  const misplaced = ckpts
    .filter((n) => UNET_FAMILIES.includes(classify(n, overrides)) && !unets.includes(n))
    .map((n) => ({ name: n, family: classify(n, overrides), folder: "checkpoints", should: "diffusion_models" }));
  return {
    samplers: options(info, "KSampler", "sampler_name"),
    schedulers: options(info, "KSampler", "scheduler"),
    upscalers: options(info, "UpscaleModelLoader", "model_name"),
    da3Models: options(info, "LoadDA3Model", "model_name"),
    detectors: options(info, "UltralyticsDetectorProvider", "model_name"),
    swapModels: options(info, "ReActorFaceSwap", "swap_model"),
    restorers: options(info, "ReActorFaceSwap", "face_restore_model"),
    unsortedLoras,
    unsortedModels: [...ckpts, ...unets].filter((n) => classify(n, overrides) === "unknown" && !/sdpose/i.test(n)),
    otherLoras: fam(loras, "other"),
    otherModels: [...new Set([...ckpts, ...unets])].filter((n) => classify(n, overrides) === "other" || /sdpose/i.test(n)),
    misplaced,
    families: {
      anima: {
        models: unetModels.anima,
        variants: variants(unetModels.anima),
        loras: fam(loras, "anima").filter((n) => !/turbo-lora/i.test(n)),
        turboLora: loras.find((n) => /anima-turbo-lora/i.test(n)) || null,
        clips: clips.filter((n) => /qwen_3_06b/i.test(n)),
        vaes: vaes.filter((n) => /qwen_image_vae/i.test(n)),
        patches: patches.filter((n) => /anima-lllite/i.test(n) || classify(n, overrides) === "anima"),
        controlPatches: patches.filter((n) => (/anima-lllite/i.test(n) || classify(n, overrides) === "anima") && !/inpaint/i.test(n)),
      },
      sdxl: {
        // Checkpoints with no family hint are offered here too (flagged as unverified):
        // CheckpointLoaderSimple checkpoints are overwhelmingly SDXL-based today.
        models: sdxlModels,
        variants: variants(sdxlModels),
        unverified: ckpts.filter((n) => classify(n, overrides) === "unknown" && !/sdpose/i.test(n)),
        loras: fam(loras, "sdxl"),
        controlnets: options(info, "ControlNetLoader", "control_net_name").filter((n) => !SDXL_NET_EXCLUDE.test(n)),
      },
      zimage: {
        models: unetModels.zimage,
        variants: variants(unetModels.zimage),
        loras: fam(loras, "zimage"),
        clips: clips.filter((n) => /qwen_3_4b/i.test(n)),
        vaes: vaes.filter((n) => /(^|[\\/])ae\.safetensors$/i.test(n)),
        patches: patches.filter((n) => /z[-_]?image.*control/i.test(n) || classify(n, overrides) === "zimage"),
      },
      krea2: {
        models: unetModels.krea2,
        variants: variants(unetModels.krea2),
        loras: krea2Loras.filter((n) => !isControlLora(n) && !isEditLora(n) && !/style[-_]?reference/i.test(n)),
        controlLoras: krea2Loras.filter((n) => isControlLora(n)),
        styleLora: loras.find((n) => /krea2[-_]?style[-_]?reference/i.test(n)) || null,
        editLora: editLoras.at(-1) || null,
        editLoras,
        clips: clips.filter((n) => /qwen3[-_]?vl/i.test(n)),
        vaes: vaes.filter((n) => /qwen_image_vae/i.test(n)),
      },
    },
  };
}
