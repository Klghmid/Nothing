// Engine entry: build a family's task workflow, check family purity, report readiness.
import { Graph, finalize, fail } from "./graph.mjs";
import { packOf, TASKS, TASK_GROUPS, ASPECTS, PACKS } from "./catalog.mjs";
import { readInventory as readFiles, FAMILY_IDS, classify, variantOf } from "./inventory.mjs";
import * as c from "./common.mjs";
import anima from "./families/anima.mjs";
import sdxl from "./families/sdxl.mjs";
import zimage from "./families/zimage.mjs";
import krea2 from "./families/krea2.mjs";

export const FAMILIES = { anima, sdxl, zimage, krea2 };
export { FAMILY_IDS, classify, variantOf };

// Installed files sorted by family, plus the model each family uses when none is chosen
// (the same preference its loader applies), so the form can show it and its preset.
export function readInventory(info, overrides) {
  const inv = readFiles(info, overrides);
  for (const [id, fam] of Object.entries(FAMILIES)) {
    const models = inv.families[id].models || [];
    inv.families[id].auto = models.find((n) => fam.preferModel?.test(n)) || models[0] || null;
  }
  return inv;
}

// Nodes only one family may contain, and the CLIPLoader type each UNET family uses.
const EXCLUSIVE = {
  anima: ["AnimaLLLiteApply"],
  sdxl: ["CheckpointLoaderSimple", "LoraLoader", "ControlNetLoader", "ControlNetApplyAdvanced", "SetUnionControlNetType", "VAEEncodeForInpaint"],
  zimage: ["ModelSamplingAuraFlow", "ZImageFunControlnet", "QwenImageDiffsynthControlnet"],
  krea2: ["Krea2ControlLoRALoader", "Krea2ControlApply", "Krea2ControlImageEncode", "Krea2EditModelPatch", "Krea2EditGroundedEncode", "ModelSamplingFlux", "TextEncodeQwenImageEditPlus", "FluxKontextMultiReferenceLatentMethod"],
};
const CLIP_TYPE = { anima: "stable_diffusion", zimage: "lumina2", krea2: "krea2" };

// Safety check run on every workflow before it is sent: no foreign family nodes, and every
// loader loads a file that the inventory assigned to this family.
export function assertFamily(family, g, inv) {
  const f = inv.families[family];
  const foreign = Object.entries(EXCLUSIVE).filter(([id]) => id !== family).flatMap(([, types]) => types);
  const problems = [];
  const own = (list, name) => (list || []).filter(Boolean).includes(name);
  for (const node of Object.values(g.nodes)) {
    const t = node.class_type, i = node.inputs;
    if (foreign.includes(t)) problems.push(`${t} belongs to another family`);
    if (family === "sdxl" && ["UNETLoader", "CLIPLoader", "LoraLoaderModelOnly", "ModelPatchLoader"].includes(t)) problems.push(`${t} is not part of SDXL workflows`);
    if (t === "UNETLoader" && !own(f.models, i.unet_name)) problems.push(`model ${i.unet_name} is not a ${family} model`);
    if (t === "CLIPLoader" && (i.type !== CLIP_TYPE[family] || !own(f.clips, i.clip_name))) problems.push(`text encoder ${i.clip_name} (${i.type}) does not match ${family}`);
    if (t === "VAELoader" && !own(f.vaes, i.vae_name)) problems.push(`VAE ${i.vae_name} does not match ${family}`);
    if (t === "LoraLoaderModelOnly" && !own([...(f.loras || []), f.turboLora, f.styleLora, f.editLora], i.lora_name)) problems.push(`LoRA ${i.lora_name} is not a ${family} LoRA`);
    if (t === "LoraLoader" && !own(f.loras, i.lora_name)) problems.push(`LoRA ${i.lora_name} is not an SDXL LoRA`);
    if (t === "CheckpointLoaderSimple" && !own(f.models, i.ckpt_name)) problems.push(`checkpoint ${i.ckpt_name} is not an SDXL checkpoint`);
    if (t === "ModelPatchLoader" && !own(f.patches, i.name)) problems.push(`patch ${i.name} is not a ${family} patch`);
    if (t === "ControlNetLoader" && !own(f.controlnets, i.control_net_name)) problems.push(`ControlNet ${i.control_net_name} is not an SDXL ControlNet`);
    if (t === "Krea2ControlLoRALoader" && !own(f.controlLoras, i.lora_name)) problems.push(`control LoRA ${i.lora_name} is not a Krea 2 control LoRA`);
  }
  if (problems.length) throw fail("Safety check stopped a mixed workflow: " + [...new Set(problems)].join("; "));
  return g;
}

export function taskOf(familyId, taskId) {
  const fam = FAMILIES[familyId];
  if (!fam) throw Object.assign(new Error("Unknown model family"), { status: 400 });
  const task = fam.tasks[taskId];
  if (!task) throw fail(`${TASKS[taskId]?.label || taskId} is not offered for ${fam.label}`);
  if (task.unavailable) throw fail(task.unavailable);
  return { fam, task };
}

export function buildWorkflow(familyId, taskId, params, ctx) {
  const { task } = taskOf(familyId, taskId);
  const p = { ...params, seed: c.seedOf(params || {}) };
  const g = new Graph({ family: familyId, info: ctx.info });
  const image = task.build(g, p, ctx);
  g.add("SaveImage", { images: image, filename_prefix: `WireStudio/${familyId}-${taskId}` }, "Save image");
  assertFamily(familyId, g, ctx.inv);
  return { prompt: finalize(g, packOf), notes: g.notes, seed: p.seed };
}

// Family-free utilities: background removal and a preview of a control map.
export function buildUtility(kind, p, ctx) {
  const g = new Graph({ family: "utility", info: ctx.info });
  const src = c.loadImage(g, p.image, "Image");
  let image;
  if (kind === "remove-bg") image = c.removeBackground(g, src);
  else if (kind === "map") {
    const { w, h } = c.sourceSize(p);
    const k = Math.min(1, 1536 / Math.max(w, h));
    image = c.controlMap(g, String(p.kind || "canny"), src, { ...p, isMap: false }, { width: c.round(w * k, 16), height: c.round(h * k, 16), invert: !!p.invert });
  } else throw Object.assign(new Error("Unknown utility"), { status: 400 });
  g.add("SaveImage", { images: image, filename_prefix: `WireStudio/utility-${kind}` }, "Save image");
  return { prompt: finalize(g, packOf), notes: g.notes };
}

// Readiness of every family × task, with what is missing and where to get it.
export function readiness(ctx) {
  const result = {};
  for (const [id, fam] of Object.entries(FAMILIES)) {
    result[id] = {};
    for (const [taskId, task] of Object.entries(fam.tasks)) {
      if (task.unavailable) {
        result[id][taskId] = { state: "off", reason: task.unavailable, items: [] };
        continue;
      }
      const items = (task.needs?.(ctx) || []).filter(Boolean);
      const seen = new Set();
      const unique = items.filter((n) => !seen.has(n.kind + n.label) && seen.add(n.kind + n.label));
      const blocked = unique.some((n) => n.level === "required" && !n.ok);
      const limited = unique.some((n) => n.level !== "required" && !n.ok);
      result[id][taskId] = { state: blocked ? "missing" : limited ? "limited" : "ready", items: unique };
    }
  }
  result.utility = {
    "remove-bg": { state: ctx.info.BiRefNetRMBG || ctx.info.RMBG ? "ready" : "missing", items: [{ ok: !!(ctx.info.BiRefNetRMBG || ctx.info.RMBG), level: "required", kind: "node", label: "BiRefNetRMBG or RMBG", why: "Removes the background", help: PACKS.rmbg }] },
  };
  return result;
}

// Everything the browser needs to draw forms (sent once in /api/bootstrap).
export function schema() {
  const families = {};
  for (const [id, fam] of Object.entries(FAMILIES)) {
    families[id] = {
      id,
      label: fam.label,
      tagline: fam.tagline,
      promptStyle: fam.promptStyle,
      defaults: fam.defaults,
      presets: fam.presets || {},
      tasks: Object.fromEntries(
        Object.entries(fam.tasks).map(([taskId, t]) => [taskId, t.unavailable ? { unavailable: t.unavailable } : { fields: t.fields, notes: t.notes || [], badge: t.badge || "" }]),
      ),
    };
  }
  return { families, tasks: TASKS, groups: TASK_GROUPS, aspects: ASPECTS, order: FAMILY_IDS };
}
