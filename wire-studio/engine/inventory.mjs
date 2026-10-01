// Reads what is installed on the connected ComfyUI and sorts every model and LoRA into
// exactly one family, so a family's workflows can never load another family's weights.
// Order of evidence: your own assignment in the Library > folder name > file name.
import { options } from "./graph.mjs";

export const FAMILY_IDS = ["anima", "sdxl", "zimage", "krea2"];

const OTHER = /(^|[^a-z])(sd[-_ ]?1[._-]?5|sd15|v1-5|sd[-_ ]?3|flux|sdpose|svd|cascade|hunyuan|wan2?|qwen|ltx|cosmos|kolors|lumina|hidream|chroma|aura)([^a-z]|$)|refiner/i;
const tokens = (s) => s.split(/[^a-zA-Z0-9]+/).filter(Boolean);

function byName(text) {
  if (/krea[-_ ]?2/i.test(text) && !/flux/i.test(text)) return "krea2";
  if (/z[-_ ]?image|zimage|(^|[^a-z])zit[-_]/i.test(text)) return "zimage";
  if (tokens(text).some((t) => /^anima(\d|$)/i.test(t))) return "anima";
  if (/xl|illustrious|noob|pony|animagine/i.test(text) && !OTHER.test(text)) return "sdxl";
  if (OTHER.test(text)) return "other";
  return null;
}

export function classify(name, overrides = {}) {
  if (overrides[name]) return overrides[name];
  const parts = String(name).replaceAll("\\", "/").split("/");
  for (const folder of parts.slice(0, -1)) {
    const f = byName(folder);
    if (f) return f;
  }
  return byName(parts.at(-1)) || "unknown";
}

const SDXL_NET_EXCLUDE = /sd15|sd1[._-]?5|v11[pfe]|control_v1|flux|qwen|z[-_]?image|anima|krea|wan|sd3/i;

export function readInventory(info = {}, overrides = {}) {
  const ckpts = options(info, "CheckpointLoaderSimple", "ckpt_name");
  const unets = options(info, "UNETLoader", "unet_name");
  const loras = [...new Set([...options(info, "LoraLoader", "lora_name"), ...options(info, "LoraLoaderModelOnly", "lora_name")])];
  const clips = options(info, "CLIPLoader", "clip_name");
  const vaes = options(info, "VAELoader", "vae_name");
  const patches = options(info, "ModelPatchLoader", "name");
  const fam = (list, id) => list.filter((n) => classify(n, overrides) === id);
  const unsortedLoras = loras.filter((n) => ["unknown", "other"].includes(classify(n, overrides)));
  const krea2Loras = fam(loras, "krea2");
  const isControlLora = (n) => /depth|control|canny|pose/i.test(n.split(/[\\/]/).pop()) && !/style|edit/i.test(n);
  return {
    samplers: options(info, "KSampler", "sampler_name"),
    schedulers: options(info, "KSampler", "scheduler"),
    upscalers: options(info, "UpscaleModelLoader", "model_name"),
    detectors: options(info, "UltralyticsDetectorProvider", "model_name"),
    swapModels: options(info, "ReActorFaceSwap", "swap_model"),
    restorers: options(info, "ReActorFaceSwap", "face_restore_model"),
    unsortedLoras,
    unsortedModels: [...ckpts, ...unets].filter((n) => classify(n, overrides) === "unknown" && !/sdpose/i.test(n)),
    families: {
      anima: {
        models: fam(unets, "anima"),
        loras: fam(loras, "anima").filter((n) => !/turbo-lora/i.test(n)),
        turboLora: loras.find((n) => /anima-turbo-lora/i.test(n)) || null,
        clips: clips.filter((n) => /qwen_3_06b/i.test(n)),
        vaes: vaes.filter((n) => /qwen_image_vae/i.test(n)),
        patches: patches.filter((n) => /anima-lllite/i.test(n)),
      },
      sdxl: {
        // Checkpoints with no family hint are offered here too (flagged as unverified):
        // CheckpointLoaderSimple checkpoints are overwhelmingly SDXL-based today.
        models: ckpts.filter((n) => ["sdxl", "unknown"].includes(classify(n, overrides)) && !/sdpose|inpaint.*sd15/i.test(n)),
        unverified: ckpts.filter((n) => classify(n, overrides) === "unknown" && !/sdpose/i.test(n)),
        loras: fam(loras, "sdxl"),
        controlnets: options(info, "ControlNetLoader", "control_net_name").filter((n) => !SDXL_NET_EXCLUDE.test(n)),
      },
      zimage: {
        models: fam(unets, "zimage"),
        loras: fam(loras, "zimage"),
        clips: clips.filter((n) => /qwen_3_4b/i.test(n)),
        vaes: vaes.filter((n) => /(^|[\\/])ae\.safetensors$/i.test(n)),
        patches: patches.filter((n) => /z[-_]?image.*control/i.test(n)),
      },
      krea2: {
        models: fam(unets, "krea2"),
        loras: krea2Loras.filter((n) => !isControlLora(n) && !/identity[-_]?edit|style[-_]?reference/i.test(n)),
        controlLoras: krea2Loras.filter((n) => isControlLora(n)),
        styleLora: loras.find((n) => /krea2[-_]?style[-_]?reference/i.test(n)) || null,
        editLora: loras.filter((n) => /krea2[-_]?identity[-_]?edit/i.test(n)).sort().at(-1) || null,
        clips: clips.filter((n) => /qwen3[-_]?vl/i.test(n)),
        vaes: vaes.filter((n) => /qwen_image_vae/i.test(n)),
      },
    },
  };
}
