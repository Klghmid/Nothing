// ANIMA — CircleStone Labs × Comfy Org 2B anime model (Cosmos-Predict2 DiT).
// Reference: Comfy-Org workflow_templates image_anima_base_v1 / image_anima_lllite_*.
// UNETLoader → model-only LoRAs; CLIPLoader qwen_3_06b_base (type stable_diffusion);
// VAELoader qwen_image_vae; EmptyLatentImage; KSampler euler/simple, 30 steps, CFG 4.
// Control comes from kohya-ss Anima-LLLite patches (ModelPatchLoader + AnimaLLLiteApply).
import { field, choice, need } from "../fields.mjs";
import { MODELS, PACKS } from "../catalog.mjs";
import * as c from "../common.mjs";
import { detailerNeeds, mapNeeds, upscaleNeeds, outpaintNeeds } from "../needs.mjs";

const SAMPLE = { steps: 30, cfg: 4, sampler: "euler", scheduler: "simple" };
// Turbo / distilled Anima models: CFG 1, 8–12 steps (Anima Turbo model card; 10 tested live in Anima Studio).
const TURBO = { steps: 10, cfg: 1, sampler: "euler", scheduler: "simple" };
const PREFER = /anima-base-v1|anima_base/i;
const NEGATIVE = "worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia";
const fam = (ctx) => ctx.inv.families.anima;

function loaders(g, p, ctx) {
  const f = fam(ctx);
  const unet = c.pick(f.models, p.model, PREFER, "Anima model", MODELS.animaBase);
  let model = g.add("UNETLoader", { unet_name: unet, weight_dtype: "default" }, "Anima model");
  const clip = g.add("CLIPLoader", { clip_name: c.pick(f.clips, null, /qwen_3_06b_base/i, "Anima text encoder", MODELS.animaClip), type: "stable_diffusion", device: "default" }, "Text encoder (Qwen3 0.6B)");
  const vae = g.add("VAELoader", { vae_name: c.pick(f.vaes, null, /qwen_image_vae/i, "Qwen Image VAE", MODELS.qwenImageVae) }, "Qwen Image VAE");
  ({ model } = c.applyLoras(g, { model, clip }, p.loras, f.loras, "Anima LoRA", false));
  if (p.turbo) {
    if (!f.turboLora) throw c.missing("Anima Turbo LoRA", MODELS.animaTurbo);
    model = g.add("LoraLoaderModelOnly", { model, lora_name: f.turboLora, strength_model: 1 }, "Anima Turbo LoRA");
  }
  return { model, clip, vae };
}
function prompts(g, m, p, fallback = "") {
  const positive = g.add("CLIPTextEncode", { text: String(p.prompt || fallback), clip: m.clip }, "Prompt");
  const negative = g.add("CLIPTextEncode", { text: String(p.negative ?? NEGATIVE), clip: m.clip }, "Negative prompt");
  return { positive, negative };
}
// LLLite patch on the model (inpaint, control and pose all use the same node).
function lllite(g, model, patch, image, p, mask, title) {
  const loader = g.add("ModelPatchLoader", { name: patch }, title + " patch");
  return g.add("AnimaLLLiteApply", { model, model_patch: loader, image, mask, strength: c.clamp(p.strength ?? p.context, 1, 0, 2), start_percent: 0, end_percent: c.clamp(p.end, 1, 0.1, 1) }, "Apply " + title);
}
const patchFor = (ctx, re) => fam(ctx).patches.find((n) => re.test(n));
// Ordered preference: the first pattern with an installed file wins (not the first file in
// alphabetical order, which would pick legacy any-test-like-1 over v2).
const preferPatch = (ctx, list) => {
  for (const re of list) {
    const hit = patchFor(ctx, re);
    if (hit) return hit;
  }
  return null;
};
// Every installed Anima control patch (the inpaint patches are not control patches).
const controlPatches = (ctx) => fam(ctx).patches.filter((n) => !/inpaint/i.test(n));
const sampleAndDecode = (g, m, latent, p, denoise = 1) => c.decode(g, c.ksampler(g, { ...m, latent, sample: c.sampling(p, SAMPLE), denoise }), m.vae);

const baseNeeds = (ctx) => [
  need.model(fam(ctx).models, MODELS.animaBase, "Anima model", "The diffusion model"),
  need.model(fam(ctx).clips, MODELS.animaClip, "Qwen3 0.6B text encoder", "Reads the prompt"),
  need.model(fam(ctx).vaes, MODELS.qwenImageVae, "Qwen Image VAE", "Encodes / decodes images"),
];
const common = [field.model(), field.loras()];
const advanced = [field.negative(NEGATIVE), field.seed(), field.sampling()];
const turboField = field.toggle("turbo", "Turbo (8 steps)", false, { hint: "Uses the official Anima Turbo LoRA: 8 steps, CFG 1", preset: { on: { steps: 8, cfg: 1 }, off: { steps: 30, cfg: 4 } } });

// Control types and the LLLite patch for each (kohya-ss Anima-LLLite: any-test-like-v2 is trained
// on Anima Base v1.0 with line art, scribble and grayscale; the *-1 patches are legacy Preview3).
// Line and scribble inputs are black on white, so generated maps are inverted (official template).
const ANY = /any-test-like-v2/i;
const CONTROL = {
  lineart: { label: "Line art", patches: [ANY, /lllite-lineart/i, /any-test-like/i], model: MODELS.animaAny, invert: true },
  canny: { label: "Canny edges", patches: [ANY, /lllite-lineart/i, /any-test-like/i], model: MODELS.animaAny, invert: true },
  scribble: { label: "Scribble", patches: [ANY, /lllite-scribble/i, /any-test-like/i], model: MODELS.animaAny, invert: true },
  gray: { label: "Grayscale (tones)", patches: [ANY], model: MODELS.animaAny, invert: false },
  // Any-control: your own line drawing, scribble or grayscale image, used as it is.
  any: { label: "Any (your own drawing)", patches: [ANY], model: MODELS.animaAny, invert: false, asIs: true },
  depth: { label: "Depth", patches: [/lllite-depth/i], model: MODELS.animaDepth, invert: false },
};
const { any: _ownDrawing, ...CONTROL_FROM_PHOTO } = CONTROL;
const CONTROL_IMG2IMG = { ...CONTROL_FROM_PHOTO, pose: { label: "Pose (weak)", patches: [/lllite-pose/i], model: MODELS.animaPose, invert: false, status: "partial" } };
const kindChoices = (table) => Object.entries(table).map(([k, v]) => ({ ...choice(k, v.label), ...(v.status ? { status: v.status } : {}) }));
// The patch for a control type, or the one picked under Advanced (any installed control patch).
function controlPatch(ctx, spec, wanted) {
  if (wanted) {
    if (controlPatches(ctx).includes(wanted)) return wanted;
    throw c.missing(`Anima control patch "${wanted}"`, spec.model);
  }
  const patch = preferPatch(ctx, spec.patches);
  if (!patch) throw c.missing(`Anima LLLite ${spec.label.toLowerCase()} patch`, spec.model);
  return patch;
}
const controlNeeds = (ctx) => [
  need.node(ctx, "AnimaLLLiteApply", PACKS.core, "Applies the control patch"),
  need.model(preferPatch(ctx, CONTROL.lineart.patches), MODELS.animaAny, "Anima LLLite any-test-like v2", "Line art / canny / scribble / grayscale control"),
  need.model(preferPatch(ctx, CONTROL.depth.patches), MODELS.animaDepth, "Anima LLLite depth", "Depth control", "recommended"),
];

export default {
  id: "anima",
  label: "Anima",
  tagline: "Anime & illustration · 2B",
  promptStyle: "Tags work best: masterpiece, best quality, score_7, 1girl, …",
  defaults: { ...SAMPLE, negative: NEGATIVE, width: 1024, height: 1024 },
  preferModel: PREFER,
  presets: { turbo: { label: "Turbo model", ...TURBO }, regular: { label: "Standard", ...SAMPLE } },
  baseNeeds,
  unsupported: {
    style: "No IPAdapter or style-reference model exists for Anima, and Anima rejects area conditioning (Anima Studio live test).",
    identity: "No identity-preserving edit or reference model exists for Anima.",
  },
  tasks: {
    generate: {
      evidence: "official",
      verified: "inference",
      fields: [field.prompt({ placeholder: "masterpiece, best quality, score_7, 1girl, silver hair, night city, neon lights" }), ...common, field.size(), turboField, field.slider("batch", "Images", 1, 4, 1, 1), ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), need.model(fam(ctx).turboLora, MODELS.animaTurbo, "Anima Turbo LoRA", "Optional 8-step mode", "recommended")],
      build(g, p, ctx) {
        const m = { ...loaders(g, p, ctx) };
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        return sampleAndDecode(g, m, g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas"), p);
      },
    },
    img2img: {
      evidence: "composed",
      verified: "inference",
      fields: [field.image("image", "Source image"), field.prompt({ placeholder: "Describe the whole picture as it should look" }), field.slider("denoise", "Change strength", 0.05, 1, 0.01, 0.55, { hint: "Low keeps the picture, high redraws it" }), ...common, turboField, field.slider("batch", "Variations", 1, 4, 1, 1), ...advanced],
      needs: baseNeeds,
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const latent = c.repeatLatent(g, c.encode(g, c.loadImage(g, p.image, "Source image"), m.vae), c.int(p.batch, 1, 1, 4));
        return sampleAndDecode(g, m, latent, p, c.clamp(p.denoise, 0.55, 0.05, 1));
      },
    },
    inpaint: {
      evidence: "official",
      verified: "inference",
      fields: [field.image("image", "Image"), field.mask(), field.prompt({ placeholder: "What should appear in the painted area" }), field.slider("denoise", "Redraw strength", 0.1, 1, 0.01, 1, { hint: "1.0 replaces the area; 0.5 changes it gently" }), field.slider("context", "Match surroundings", 0, 1.5, 0.05, 1, { advanced: true, hint: "Strength of the Anima LLLite inpaint patch" }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), need.node(ctx, "AnimaLLLiteApply", PACKS.core, "Applies the inpaint patch", "recommended"), need.model(patchFor(ctx, /inpainting/i), MODELS.animaInpaint, "Anima LLLite inpainting v2", "Makes the fill match its surroundings", "recommended")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const src = c.loadImage(g, p.image, "Image");
        const mask = c.loadMask(g, p.mask);
        const patch = patchFor(ctx, /inpainting-v2/i) || patchFor(ctx, /inpainting/i);
        if (patch && g.has("AnimaLLLiteApply")) m.model = lllite(g, m.model, patch, src, { strength: p.context }, mask, "inpaint context (LLLite)");
        else g.note("Anima inpaint patch not installed: using plain masked sampling");
        const latent = g.add("SetLatentNoiseMask", { samples: c.encode(g, src, m.vae), mask }, "Limit to painted area");
        const { w, h } = c.sourceSize(p);
        return c.composite(g, src, sampleAndDecode(g, m, latent, p, c.clamp(p.denoise, 1, 0.1, 1)), c.softEdge(g, mask, w, h));
      },
    },
    outpaint: {
      evidence: "composed",
      verified: "inference",
      fields: [field.image("image", "Image"), field.edges(), field.prompt({ placeholder: "Describe the scenery to add (avoid repeating the subject)" }), field.select("fill", "Pre-fill", [choice("navier-stokes", "Smooth (recommended)"), choice("telea", "Telea"), choice("none", "None")], "navier-stokes", { advanced: true }), field.slider("denoise", "Redraw strength", 0.5, 1, 0.01, 1, { advanced: true }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), need.model(patchFor(ctx, /inpainting/i), MODELS.animaInpaint, "Anima LLLite inpainting v2", "Continues the picture coherently", "recommended"), ...outpaintNeeds(ctx)],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const pad = c.padCanvas(g, c.loadImage(g, p.image, "Image"), p);
        const filled = c.edgeFill(g, pad.image, pad.mask, p);
        const base = filled || pad.image;
        const patch = patchFor(ctx, /inpainting-v2/i) || patchFor(ctx, /inpainting/i);
        // The LLLite patch was trained on binary masks; the feathered mask still drives the blend.
        if (patch && g.has("AnimaLLLiteApply")) m.model = lllite(g, m.model, patch, base, { strength: p.context }, c.hardMask(g, pad.mask), "inpaint context (LLLite)");
        const latent = g.add("SetLatentNoiseMask", { samples: c.encode(g, base, m.vae), mask: pad.mask }, "Limit to new area");
        return c.composite(g, base, sampleAndDecode(g, m, latent, p, filled ? c.clamp(p.denoise, 1, 0.5, 1) : 1), pad.mask);
      },
    },
    face: {
      evidence: "community",
      verified: "inference",
      fields: [field.image("image", "Image"), field.select("target", "Fix", [choice("face", "Whole face"), choice("eyes", "Eyes"), choice("lips", "Lips")], "face"), field.prompt({ optional: true, placeholder: "Optional: describe the face (e.g. blue eyes, smile)" }), field.slider("denoise", "Strength", 0.1, 0.9, 0.01, 0.4), field.slider("threshold", "Detection sensitivity", 0.1, 0.9, 0.01, 0.35, { advanced: true, hint: "Lower finds more (and smaller) faces" }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), ...detailerNeeds(ctx, "face")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p, "detailed face, beautiful eyes"));
        return c.detailer(g, c.loadImage(g, p.image, "Image"), ctx, { ...m, sample: c.sampling(p, { ...SAMPLE, steps: 20 }) }, p, p.target || "face");
      },
    },
    hands: {
      evidence: "community",
      verified: "inference",
      fields: [field.image("image", "Image"), field.prompt({ optional: true, placeholder: "Optional: e.g. detailed hands, five fingers" }), field.slider("denoise", "Strength", 0.1, 0.9, 0.01, 0.45), field.slider("threshold", "Detection sensitivity", 0.1, 0.9, 0.01, 0.45, { advanced: true }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), ...detailerNeeds(ctx, "hand")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p, "detailed hands, five fingers"));
        return c.detailer(g, c.loadImage(g, p.image, "Image"), ctx, { ...m, sample: c.sampling(p, { ...SAMPLE, steps: 20 }) }, p, "hand");
      },
    },
    faceswap: {
      unavailable:
        "Not offered for Anima: face-swap models (InsightFace) are trained on photos and do not detect anime faces reliably. Use Face Fix with a character prompt or LoRA instead.",
    },
    pose: {
      badge: "Weak control",
      status: "partial",
      statusNote: "Legacy pose patch; its own card says it guides placement loosely",
      evidence: "community",
      verified: "graph",
      notes: ["Anima's pose patch is the legacy preview3 model; its own card says it guides placement loosely. For strict poses use Line art control on a sketch."],
      fields: [field.image("image", "Pose reference", { hint: "A photo or drawing of the pose, or a ready pose map" }), field.toggle("isMap", "Image is already a pose map", false), field.prompt({ placeholder: "Who is in the pose: 1girl, school uniform, park" }), field.size({ fromImage: true }), field.slider("strength", "Pose strength", 0.2, 2, 0.05, 1), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), need.node(ctx, "AnimaLLLiteApply", PACKS.core, "Applies the pose patch"), need.model(patchFor(ctx, /lllite-pose/i), MODELS.animaPose, "Anima LLLite pose", "Reads the skeleton"), ...mapNeeds(ctx, ["pose"])],
      build(g, p, ctx) {
        const patch = patchFor(ctx, /lllite-pose/i);
        if (!patch) throw c.missing("Anima LLLite pose patch", MODELS.animaPose);
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        const map = c.controlMap(g, "pose", c.loadImage(g, p.image, "Pose reference"), p, { width, height });
        m.model = lllite(g, m.model, patch, map, p, undefined, "pose (LLLite)");
        return sampleAndDecode(g, m, g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas"), p);
      },
    },
    control: {
      evidence: "official",
      verified: "graph",
      fields: [
        field.select("kind", "Control type", kindChoices(CONTROL), "lineart"),
        field.image("image", "Control image", { hint: "A picture to take the structure from, or a ready map" }),
        field.toggle("isMap", "Image is already a map", false),
        field.prompt({ placeholder: "Describe the new picture" }),
        field.size({ fromImage: true }),
        field.slider("strength", "Control strength", 0.2, 2, 0.05, 1),
        field.slider("end", "Release control at", 0.3, 1, 0.05, 1, { advanced: true, hint: "Lower lets the model finish details freely" }),
        field.toggle("invertMap", "Invert map", false, { advanced: true, hint: "Anima line models expect black lines on white" }),
        field.select("patch", "Control patch", "controlPatches", "", { advanced: true, hint: "Automatic picks the Base v1.0 any-test-like v2 patch for lines, scribble and grayscale" }),
        ...common,
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...controlNeeds(ctx), ...mapNeeds(ctx, ["lineart", "depth", "gray"])],
      build(g, p, ctx) {
        const spec = CONTROL[p.kind] || CONTROL.lineart;
        const patch = controlPatch(ctx, spec, p.patch);
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        const kind = CONTROL[p.kind] ? p.kind : "lineart";
        const map = c.controlMap(g, kind, c.loadImage(g, p.image, "Control image"), { ...p, isMap: spec.asIs || p.isMap }, { width, height, invert: spec.invert });
        m.model = lllite(g, m.model, patch, map, p, undefined, spec.label.toLowerCase() + " control (LLLite)");
        return sampleAndDecode(g, m, g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas"), p);
      },
    },
    "img2img-control": {
      evidence: "composed",
      verified: "graph",
      notes: ["Redraws the source while an LLLite patch holds its structure. The map is made from the source unless you add a separate control image."],
      fields: [
        field.image("image", "Source image"),
        field.select("kind", "Keep from the source", kindChoices(CONTROL_IMG2IMG), "lineart"),
        field.prompt({ placeholder: "Describe the whole picture as it should look" }),
        field.slider("denoise", "Change strength", 0.2, 1, 0.01, 0.6, { hint: "How much is redrawn; the control keeps the structure" }),
        field.slider("strength", "Control strength", 0.2, 2, 0.05, 0.8),
        field.image("control", "Separate control image", { optional: true, advanced: true, hint: "Optional: take the structure from another image (or a ready map)" }),
        field.toggle("isMap", "Control image is already a map", false, { advanced: true, when: "control" }),
        field.slider("end", "Release control at", 0.3, 1, 0.05, 1, { advanced: true }),
        field.select("patch", "Control patch", "controlPatches", "", { advanced: true }),
        ...common,
        turboField,
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...controlNeeds(ctx), need.model(patchFor(ctx, /lllite-pose/i), MODELS.animaPose, "Anima LLLite pose", "Pose type", "recommended"), ...mapNeeds(ctx, ["lineart", "depth", "gray", "pose"])],
      build(g, p, ctx) {
        const kind = CONTROL_IMG2IMG[p.kind] ? p.kind : "lineart";
        const spec = CONTROL_IMG2IMG[kind];
        const patch = controlPatch(ctx, spec, p.patch);
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const src = c.loadImage(g, p.image, "Source image");
        const { w, h } = c.sourceSize(p);
        const width = c.round(w, 16), height = c.round(h, 16);
        // The map comes from the source itself unless a separate control image is given; a
        // ready-made map is only possible for that separate image.
        const ref = p.control ? c.loadImage(g, p.control, "Control image") : src;
        const map = c.controlMap(g, kind, ref, { ...p, isMap: !!(p.control && p.isMap) }, { width, height, invert: spec.invert });
        m.model = lllite(g, m.model, patch, map, { ...p, strength: c.clamp(p.strength, 0.8, 0, 2) }, undefined, spec.label.toLowerCase() + " control (LLLite)");
        const latent = c.encode(g, c.scaleImage(g, src, width, height, "disabled", "Fit source to /16"), m.vae);
        return sampleAndDecode(g, m, latent, p, c.clamp(p.denoise, 0.6, 0.05, 1));
      },
    },
    upscale: {
      evidence: "composed",
      verified: "inference",
      fields: [field.image("image", "Image"), field.select("scale", "Scale", [choice(1.5, "1.5×"), choice(2, "2×"), choice(3, "3×"), choice(4, "4×")], 2), field.toggle("refine", "Add detail with Anima", true, { hint: "A light second pass with your Anima model" }), field.slider("refineDenoise", "Detail strength", 0.05, 0.6, 0.01, 0.3, { when: "refine" }), field.prompt({ optional: true, when: "refine", placeholder: "Optional: describe the picture for the detail pass" }), field.model({ when: "refine" }), field.select("upscaler", "Upscale model", "upscalers", "", { advanced: true }), field.slider("refineSteps", "Detail steps", 4, 40, 1, 12, { advanced: true, when: "refine" }), field.seed()],
      needs: (ctx) => [...upscaleNeeds(ctx), ...baseNeeds(ctx).map((n) => ({ ...n, level: "recommended", why: "Only for the detail pass" }))],
      build(g, p, ctx) {
        const src = c.loadImage(g, p.image, "Image");
        if (!p.refine) return c.upscaleRefine(g, src, p, ctx, null);
        const m = loaders(g, { ...p, loras: [] }, ctx);
        Object.assign(m, prompts(g, m, p, "masterpiece, best quality, highly detailed"));
        return c.upscaleRefine(g, src, p, ctx, { ...m, sample: c.sampling(p, SAMPLE), refineSteps: 12 });
      },
    },
  },
};
