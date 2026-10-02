// Every suggested model and LoRA (engine/model-list.mjs) checked against the connected ComfyUI,
// for Setup → Suggested models & LoRAs. Each entry is
//   found    — that exact file is installed (any sub-folder): `found` lists where
//   covered  — not that file, but another installed file does the same job (an fp8 / int8
//              version, your own checkpoint…): `found` lists which ones Wire Studio uses
//   missing  — nothing installed for it yet
// Rows without one fixed file name ("your Anima LoRAs", "any depth Control-LoRA") are found
// when you have any file of that family, kind and type.
import { options } from "./graph.mjs";
import { MODEL_LIST } from "./model-list.mjs";

const FAMILY_ID = { Anima: "anima", SDXL: "sdxl", "Z-Image": "zimage", "Krea 2": "krea2" };
const LISTS = {
  checkpoints: [["CheckpointLoaderSimple", "ckpt_name"]],
  diffusion_models: [["UNETLoader", "unet_name"]],
  loras: [["LoraLoader", "lora_name"], ["LoraLoaderModelOnly", "lora_name"]],
  text_encoders: [["CLIPLoader", "clip_name"]],
  vae: [["VAELoader", "vae_name"]],
  model_patches: [["ModelPatchLoader", "name"]],
  controlnet: [["ControlNetLoader", "control_net_name"]],
  upscale_models: [["UpscaleModelLoader", "model_name"]],
  ultralytics: [["UltralyticsDetectorProvider", "model_name"]],
  insightface: [["ReActorFaceSwap", "swap_model"]],
  facerestore_models: [["ReActorFaceSwap", "face_restore_model"]],
  geometry_estimation: [["LoadDA3Model", "model_name"]],
};
const base = (n) => String(n).replaceAll("\\", "/").split("/").pop().toLowerCase();
const isPlaceholder = (m) => /\s/.test(m.file);

// Your own files for a "your … models / LoRAs" row: that family's files in that folder kind,
// of that type when the suggested folder ends in turbo/ or regular/.
function yourFiles(m, inv) {
  const top = m.path.split("/")[0];
  const fam = inv.families[FAMILY_ID[m.family]];
  const type = m.path.split("/").at(-1);
  if (fam && (top === "diffusion_models" || top === "checkpoints")) {
    const models = fam.models || [];
    return ["turbo", "regular"].includes(type) ? models.filter((n) => fam.variants?.[n] === type) : models;
  }
  if (fam && top === "loras") return /\/control$/.test(m.path) ? fam.controlLoras || [] : /\/editor$/.test(m.path) ? fam.editLoras || [] : fam.loras || [];
  if (top === "ultralytics") return (inv.detectors || []).filter((n) => !/face|hand/i.test(base(n)));
  return [];
}

export function suggestions(ctx, ready = {}) {
  const installed = Object.fromEntries(Object.entries(LISTS).map(([top, loaders]) => [top, [...new Set(loaders.flatMap(([type, input]) => options(ctx.info, type, input)))]]));
  // What each requirement check found (same logic the workflows use), by model key.
  const covered = {};
  for (const tasks of Object.values(ready))
    for (const r of Object.values(tasks || {}))
      for (const item of r.items || []) if (item.kind === "model" && item.help?.key) covered[item.help.key] = [...new Set([...(covered[item.help.key] || []), ...(item.found || [])])];
  return MODEL_LIST.map((m) => {
    const top = m.path.split("/")[0];
    const exact = isPlaceholder(m) ? [] : (installed[top] || []).filter((n) => base(n) === m.file.toLowerCase());
    const others = m.key ? covered[m.key] || [] : isPlaceholder(m) ? yourFiles(m, ctx.inv) : [];
    const status = exact.length || (isPlaceholder(m) && others.length) ? "found" : others.length ? "covered" : "missing";
    return {
      family: m.family,
      file: m.file,
      display: m.display || null,
      path: m.path,
      role: m.role,
      need: m.need,
      tasks: m.tasks,
      url: m.url || null,
      placeholder: isPlaceholder(m),
      status,
      found: exact.length ? exact : others,
    };
  });
}
