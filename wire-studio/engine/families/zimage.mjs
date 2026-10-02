// Z-IMAGE (Tongyi-MAI 6B single-stream DiT): Turbo (distilled, 8 steps) and Base.
// Reference: Comfy-Org workflow_templates image_z_image_turbo / image_z_image /
// image_z_image_turbo_fun_union_controlnet / utility_z_image_turbo_2k_upscaler.
// UNETLoader → model-only LoRAs → [Fun ControlNet patch] → ModelSamplingAuraFlow(shift 3);
// CLIPLoader qwen_3_4b (type lumina2); VAELoader ae; EmptySD3LatentImage;
// Turbo: KSampler 8 steps, CFG 1, res_multistep/simple, negative = ConditioningZeroOut.
// Base: 25 steps, CFG 4 with a real negative prompt.
import { field, choice, need } from "../fields.mjs";
import { MODELS, PACKS } from "../catalog.mjs";
import * as c from "../common.mjs";
import { detailerNeeds, swapNeeds, mapNeeds, upscaleNeeds, outpaintNeeds } from "../needs.mjs";

const TURBO = { steps: 8, cfg: 1, sampler: "res_multistep", scheduler: "simple" };
const BASE = { steps: 25, cfg: 4, sampler: "res_multistep", scheduler: "simple" };
const NEGATIVE = "blurry, low quality, distorted, extra fingers, watermark, text";
const fam = (ctx) => ctx.inv.families.zimage;
// Turbo vs Base comes from the inventory (a turbo/ or regular/ folder, else the file name).
const PREFER = /z_image_turbo_bf16|turbo/i;
const defaultsFor = (ctx, name) => (fam(ctx).variants?.[name] === "regular" ? BASE : TURBO);

function loaders(g, p, ctx) {
  const f = fam(ctx);
  const unet = c.pick(f.models, p.model, PREFER, "Z-Image model", MODELS.zimageTurbo);
  let model = g.add("UNETLoader", { unet_name: unet, weight_dtype: "default" }, "Z-Image model");
  const clip = g.add("CLIPLoader", { clip_name: c.pick(f.clips, null, /qwen_3_4b\.safetensors$|qwen_3_4b/i, "Z-Image text encoder", MODELS.zimageClip), type: "lumina2", device: "default" }, "Text encoder (Qwen3 4B)");
  const vae = g.add("VAELoader", { vae_name: c.pick(f.vaes, null, /ae\.safetensors$/i, "Z-Image VAE (ae)", MODELS.zimageVae) }, "Z-Image VAE (ae)");
  ({ model } = c.applyLoras(g, { model, clip }, p.loras, f.loras, "Z-Image LoRA", false));
  return { model, clip, vae, sample: c.sampling(p, defaultsFor(ctx, unet)) };
}
// AuraFlow shift is applied last, after any control patch (official template order).
const shifted = (g, model, p) => g.add("ModelSamplingAuraFlow", { model, shift: c.clamp(p.shift, 3, 0, 20) }, "Sampling shift");
function prompts(g, m, p, fallback = "") {
  const positive = g.add("CLIPTextEncode", { text: String(p.prompt || fallback), clip: m.clip }, "Prompt");
  const negative =
    m.sample.cfg > 1.01 ? g.add("CLIPTextEncode", { text: String(p.negative ?? NEGATIVE), clip: m.clip }, "Negative prompt") : g.add("ConditioningZeroOut", { conditioning: positive }, "No negative (CFG 1)");
  return { positive, negative };
}
const finish = (g, m, latent, p, denoise = 1) => c.decode(g, c.ksampler(g, { model: shifted(g, m.model, p), positive: m.positive, negative: m.negative, latent, sample: m.sample, denoise }), m.vae);

// Fun ControlNet Union (model patch). Union 2.x also has an inpaint mode (inpaint_image + mask).
const unionPatch = (ctx, inpaint) => {
  const list = fam(ctx).patches.filter((n) => !/tile/i.test(n));
  if (inpaint) return list.find((n) => /union[-_]?2/i.test(n) && !/lite/i.test(n)) || list.find((n) => /union[-_]?2/i.test(n));
  return list.find((n) => /union[-_]?2\.1/i.test(n) && !/lite/i.test(n)) || list.find((n) => /union/i.test(n)) || list[0];
};
const controlNode = (g) => (g.has("ZImageFunControlnet") ? "ZImageFunControlnet" : g.has("QwenImageDiffsynthControlnet") ? "QwenImageDiffsynthControlnet" : null);
function funControl(g, m, patch, inputs, title) {
  const node = controlNode(g);
  const loader = g.add("ModelPatchLoader", { name: patch }, "Fun ControlNet Union");
  m.model = g.add(node, { model: m.model, model_patch: loader, vae: m.vae, ...inputs }, title);
}
// Masked redraw: Union 2.x inpaint mode when installed, else differential diffusion.
function maskedRedraw(g, m, p, ctx, image, mask, denoise) {
  const patch = unionPatch(ctx, true);
  if (patch && g.has("ZImageFunControlnet")) funControl(g, m, patch, { inpaint_image: image, mask, strength: c.clamp(p.context, 0.9, 0, 1.5) }, "Inpaint context (Fun Union)");
  else {
    if (g.has("DifferentialDiffusion")) m.model = g.add("DifferentialDiffusion", { model: m.model }, "Differential diffusion");
    g.note("Fun ControlNet Union 2.x not installed: using masked sampling");
  }
  return finish(g, m, g.add("SetLatentNoiseMask", { samples: c.encode(g, image, m.vae), mask }, "Limit to painted area"), p, denoise);
}

const baseNeeds = (ctx) => [
  need.model(fam(ctx).models.length, MODELS.zimageTurbo, "Z-Image model (Turbo or Base)", "The diffusion model"),
  need.model(fam(ctx).clips.length, MODELS.zimageClip, "Qwen3 4B text encoder", "Reads the prompt"),
  need.model(fam(ctx).vaes.length, MODELS.zimageVae, "ae.safetensors VAE", "Encodes / decodes images"),
  need.node(ctx, "ModelSamplingAuraFlow", PACKS.core, "Z-Image sampling"),
];
const controlNeeds = (ctx, level = "required") => [
  need.anyNode(ctx, ["ZImageFunControlnet", "QwenImageDiffsynthControlnet"], PACKS.core, "Applies the Fun ControlNet", level),
  need.model(unionPatch(ctx, false), MODELS.zimageUnion, "Z-Image Fun ControlNet Union", "Control model (model_patches)", level),
];
const common = [field.model(), field.loras()];
const advanced = [field.negative(NEGATIVE), field.seed(), field.sampling(), field.slider("shift", "Shift", 1, 8, 0.1, 3, { advanced: true, hint: "AuraFlow sampling shift (template default 3)" })];
const KINDS = [choice("canny", "Canny edges"), choice("hed", "Soft edge (HED)"), choice("depth", "Depth"), choice("pose", "Pose (skeleton)"), choice("mlsd", "Straight lines (M-LSD)")];

export default {
  id: "zimage",
  label: "Z-Image",
  tagline: "Photoreal & versatile · 6B",
  promptStyle: "Natural sentences: subject, look, setting, light, camera.",
  defaults: { ...TURBO, negative: NEGATIVE, width: 1024, height: 1024, shift: 3 },
  preferModel: PREFER,
  presets: { turbo: { label: "Turbo", ...TURBO }, regular: { label: "Base", ...BASE } },
  baseNeeds,
  tasks: {
    generate: {
      fields: [field.prompt({ placeholder: "A woman with wavy hair on a harbour at golden hour, pastel houses behind her, cinematic close-up" }), ...common, field.size(), field.slider("batch", "Images", 1, 4, 1, 1), ...advanced],
      needs: baseNeeds,
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        return finish(g, m, g.add("EmptySD3LatentImage", { width, height, batch_size: batch }, "Empty canvas"), p);
      },
    },
    img2img: {
      fields: [field.image("image", "Source image"), field.prompt({ placeholder: "Describe the whole picture as it should look" }), field.slider("denoise", "Change strength", 0.05, 1, 0.01, 0.55), ...common, field.slider("batch", "Variations", 1, 4, 1, 1), ...advanced],
      needs: baseNeeds,
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const latent = c.repeatLatent(g, c.encode(g, c.loadImage(g, p.image, "Source image"), m.vae), c.int(p.batch, 1, 1, 4));
        return finish(g, m, latent, p, c.clamp(p.denoise, 0.55, 0.05, 1));
      },
    },
    inpaint: {
      fields: [field.image("image", "Image"), field.mask(), field.prompt({ placeholder: "What should appear in the painted area" }), field.slider("denoise", "Redraw strength", 0.1, 1, 0.01, 1), field.slider("context", "Match surroundings", 0, 1.5, 0.05, 0.9, { advanced: true, hint: "Fun Union 2.x inpaint strength (model card: 0.65–1.0)" }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), need.node(ctx, "ZImageFunControlnet", PACKS.core, "Inpaint mode of the Fun ControlNet", "recommended"), need.model(unionPatch(ctx, true), MODELS.zimageUnion21, "Fun ControlNet Union 2.1", "Makes the fill match its surroundings", "recommended")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const src = c.loadImage(g, p.image, "Image");
        const mask = c.loadMask(g, p.mask);
        const { w, h } = c.sourceSize(p);
        return c.composite(g, src, maskedRedraw(g, m, p, ctx, src, mask, c.clamp(p.denoise, 1, 0.1, 1)), c.softEdge(g, mask, w, h));
      },
    },
    outpaint: {
      fields: [field.image("image", "Image"), field.edges(), field.prompt({ placeholder: "Describe the scenery to add (avoid repeating the subject)" }), field.select("fill", "Pre-fill", [choice("navier-stokes", "Smooth (recommended)"), choice("telea", "Telea"), choice("none", "None")], "navier-stokes", { advanced: true }), field.slider("denoise", "Redraw strength", 0.5, 1, 0.01, 1, { advanced: true }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), need.model(unionPatch(ctx, true), MODELS.zimageUnion21, "Fun ControlNet Union 2.1", "Continues the picture coherently", "recommended"), ...outpaintNeeds(ctx)],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const pad = c.padCanvas(g, c.loadImage(g, p.image, "Image"), p);
        const filled = c.edgeFill(g, pad.image, pad.mask, p);
        const base = filled || pad.image;
        return c.composite(g, base, maskedRedraw(g, m, p, ctx, base, pad.mask, filled ? c.clamp(p.denoise, 1, 0.5, 1) : 1), pad.mask);
      },
    },
    face: {
      fields: [field.image("image", "Image"), field.select("target", "Fix", [choice("face", "Whole face"), choice("eyes", "Eyes"), choice("lips", "Lips")], "face"), field.prompt({ optional: true, placeholder: "Optional: describe the face" }), field.slider("denoise", "Strength", 0.1, 0.9, 0.01, 0.35), field.slider("threshold", "Detection sensitivity", 0.1, 0.9, 0.01, 0.35, { advanced: true }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), ...detailerNeeds(ctx, "face")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p, "detailed face, natural skin texture"));
        return c.detailer(g, c.loadImage(g, p.image, "Image"), ctx, { ...m, model: shifted(g, m.model, p) }, p, p.target || "face");
      },
    },
    hands: {
      fields: [field.image("image", "Image"), field.prompt({ optional: true, placeholder: "Optional: e.g. relaxed hands, five fingers" }), field.slider("denoise", "Strength", 0.1, 0.9, 0.01, 0.45), field.slider("threshold", "Detection sensitivity", 0.1, 0.9, 0.01, 0.45, { advanced: true }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), ...detailerNeeds(ctx, "hand")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p, "detailed hands, five fingers"));
        return c.detailer(g, c.loadImage(g, p.image, "Image"), ctx, { ...m, model: shifted(g, m.model, p) }, p, "hand");
      },
    },
    faceswap: {
      fields: [
        field.image("image", "Target image", { hint: "The picture whose face is replaced" }),
        field.image("face", "Face photo", { hint: "A clear, front-facing photo of the new face" }),
        field.toggle("blend", "Blend with Z-Image", true, { hint: "A light Z-Image face pass so the new face matches the picture" }),
        field.slider("denoise", "Blend strength", 0.1, 0.6, 0.01, 0.25, { when: "blend" }),
        field.prompt({ optional: true, placeholder: "Optional: describe the face" }),
        field.select("restore", "Face restore", [choice("codeformer", "CodeFormer"), choice("gfpgan", "GFPGAN"), choice("none", "None")], "codeformer", { advanced: true }),
        field.select("targetFaces", "Faces to replace", [choice("0", "Largest face"), choice("0,1", "Two largest"), choice("0,1,2,3", "Up to four")], "0", { advanced: true }),
        ...common,
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...swapNeeds(ctx)],
      build(g, p, ctx) {
        const image = c.faceSwap(g, c.loadImage(g, p.image, "Target image"), c.loadImage(g, p.face, "Face photo"), p, ctx);
        if (p.blend === false) return image;
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p, "detailed face, natural skin texture"));
        return c.detailer(g, image, ctx, { ...m, model: shifted(g, m.model, p) }, { ...p, denoise: c.clamp(p.denoise, 0.25, 0.1, 0.6) }, "face", "Blend new face (Z-Image)");
      },
    },
    pose: {
      fields: [
        field.image("image", "Pose reference", { hint: "A photo or drawing of the pose, or a ready pose map" }),
        field.toggle("isMap", "Image is already a pose map", false),
        field.prompt({ placeholder: "Describe who is in the pose and where" }),
        field.size({ fromImage: true }),
        field.slider("strength", "Pose strength", 0.3, 1.5, 0.05, 0.8, { hint: "Model card range 0.65–1.0" }),
        ...common,
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...controlNeeds(ctx), ...mapNeeds(ctx, ["pose"])],
      build(g, p, ctx) {
        const patch = unionPatch(ctx, false);
        if (!patch || !controlNode(g)) throw c.missing("Z-Image Fun ControlNet Union", MODELS.zimageUnion);
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        const map = c.controlMap(g, "pose", c.loadImage(g, p.image, "Pose reference"), p, { width, height });
        funControl(g, m, patch, { image: map, strength: c.clamp(p.strength, 0.8, 0, 2) }, "Apply pose control");
        return finish(g, m, g.add("EmptySD3LatentImage", { width, height, batch_size: batch }, "Empty canvas"), p);
      },
    },
    control: {
      fields: [
        field.select("kind", "Control type", KINDS, "canny"),
        field.image("image", "Control image", { hint: "A picture to take the structure from, or a ready map" }),
        field.toggle("isMap", "Image is already a map", false),
        field.prompt({ placeholder: "Describe the new picture" }),
        field.size({ fromImage: true }),
        field.slider("strength", "Control strength", 0.3, 1.5, 0.05, 0.75, { hint: "Model card range 0.65–1.0" }),
        field.toggle("invertMap", "Invert map", false, { advanced: true }),
        ...common,
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...controlNeeds(ctx), ...mapNeeds(ctx, ["hed", "depth", "pose", "mlsd"])],
      build(g, p, ctx) {
        const patch = unionPatch(ctx, false);
        if (!patch || !controlNode(g)) throw c.missing("Z-Image Fun ControlNet Union", MODELS.zimageUnion);
        const kind = KINDS.some((k) => k.value === p.kind) ? p.kind : "canny";
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        const map = c.controlMap(g, kind, c.loadImage(g, p.image, "Control image"), p, { width, height });
        funControl(g, m, patch, { image: map, strength: c.clamp(p.strength, 0.75, 0, 2) }, `Apply ${kind} control`);
        return finish(g, m, g.add("EmptySD3LatentImage", { width, height, batch_size: batch }, "Empty canvas"), p);
      },
    },
    upscale: {
      fields: [field.image("image", "Image"), field.select("scale", "Scale", [choice(1.5, "1.5×"), choice(2, "2×"), choice(3, "3×"), choice(4, "4×")], 2), field.toggle("refine", "Add detail with Z-Image", true), field.slider("refineDenoise", "Detail strength", 0.05, 0.6, 0.01, 0.33, { when: "refine", hint: "Official 2K upscaler template uses 0.33" }), field.prompt({ optional: true, when: "refine", placeholder: "Optional: describe the picture for the detail pass" }), field.model({ when: "refine" }), field.select("upscaler", "Upscale model", "upscalers", "", { advanced: true }), field.slider("refineSteps", "Detail steps", 3, 30, 1, 5, { advanced: true, when: "refine" }), field.seed()],
      needs: (ctx) => [...upscaleNeeds(ctx), ...baseNeeds(ctx).map((n) => ({ ...n, level: "recommended", why: "Only for the detail pass" }))],
      build(g, p, ctx) {
        const src = c.loadImage(g, p.image, "Image");
        if (!p.refine) return c.upscaleRefine(g, src, p, ctx, null);
        const m = loaders(g, { ...p, loras: [] }, ctx);
        // Official upscaler template: 5 steps, CFG 1, dpmpp_2m_sde / beta, denoise 0.33.
        m.sample = { ...m.sample, cfg: 1, sampler_name: "dpmpp_2m_sde", scheduler: "beta" };
        Object.assign(m, prompts(g, m, p, "masterpiece, 8k, sharp details"));
        return c.upscaleRefine(g, src, p, ctx, { ...m, model: shifted(g, m.model, p), refineSteps: 5 });
      },
    },
  },
};
