// SDXL family (SDXL 1.0, Illustrious, NoobAI, Pony and other SDXL fine-tunes).
// CheckpointLoaderSimple supplies model, CLIP and VAE; LoRAs patch model + CLIP (LoraLoader).
// Control: xinsir ControlNet Union SDXL ProMax (SetUnionControlNetType) or dedicated SDXL nets.
// Inpaint uses ProMax "repaint" + SetLatentNoiseMask: on regular checkpoints such as
// Illustrious, VAEEncodeForInpaint ignores the surroundings (Anima Studio live A/B, 2026).
import { out } from "../graph.mjs";
import { field, choice, need } from "../fields.mjs";
import { MODELS, PACKS } from "../catalog.mjs";
import * as c from "../common.mjs";
import { detailerNeeds, swapNeeds, mapNeeds, upscaleNeeds, outpaintNeeds } from "../needs.mjs";

const SAMPLE = { steps: 28, cfg: 6, sampler: "euler_ancestral", scheduler: "normal" };
// Few-step SDXL models (Turbo / Lightning / Hyper / DMD2): low CFG, euler + sgm_uniform as in the
// SDXL-Lightning reference; exact step counts vary per model, so check its page.
const TURBO = { steps: 8, cfg: 1.5, sampler: "euler", scheduler: "sgm_uniform" };
const PREFER = /illustrious|noob|sdxl|xl/i;
const NEGATIVE = "lowres, worst quality, low quality, bad anatomy, bad hands, extra fingers, text, watermark, jpeg artifacts, blurry";
const fam = (ctx) => ctx.inv.families.sdxl;

function loaders(g, p, ctx) {
  const f = fam(ctx);
  const ckpt = c.pick(f.models, p.model, PREFER, "SDXL checkpoint", MODELS.sdxlBase);
  const loader = g.add("CheckpointLoaderSimple", { ckpt_name: ckpt }, "SDXL checkpoint");
  const { model, clip } = c.applyLoras(g, { model: loader, clip: out(loader, 1) }, p.loras, f.loras, "SDXL LoRA", true);
  return { model, clip, vae: out(loader, 2), ckpt };
}
function prompts(g, m, p, fallback = "") {
  const positive = g.add("CLIPTextEncode", { text: String(p.prompt || fallback), clip: m.clip }, "Prompt");
  const negative = g.add("CLIPTextEncode", { text: String(p.negative ?? NEGATIVE), clip: m.clip }, "Negative prompt");
  return { positive, negative };
}
const sampleAndDecode = (g, m, latent, p, denoise = 1) => c.decode(g, c.ksampler(g, { ...m, latent, sample: c.sampling(p, SAMPLE), denoise }), m.vae);

// ControlNet choice: a dedicated SDXL net for the kind if installed, else Union (ProMax first).
const DEDICATED = { canny: /canny/i, lineart: /lineart|line_art|anime_?line/i, scribble: /scribble|hed|softedge|pidi/i, depth: /depth/i, pose: /openpose|[-_]pose/i, repaint: /promax/i };
const UNION_TYPE = { canny: "canny/lineart/anime_lineart/mlsd", lineart: "canny/lineart/anime_lineart/mlsd", scribble: "hed/pidi/scribble/ted", depth: "depth", pose: "openpose", repaint: "repaint" };
const isUnion = (n) => /union|promax/i.test(n);
export function pickNet(nets, kind, wanted) {
  if (wanted && nets.includes(wanted)) return { name: wanted, union: isUnion(wanted) };
  if (kind === "repaint") {
    const promax = nets.find((n) => /promax/i.test(n));
    return promax ? { name: promax, union: true } : null;
  }
  const dedicated = nets.find((n) => DEDICATED[kind].test(n) && !isUnion(n));
  if (dedicated) return { name: dedicated, union: false };
  const union = nets.find((n) => /promax/i.test(n)) || nets.find((n) => /union/i.test(n));
  return union ? { name: union, union: true } : null;
}
function applyNet(g, m, net, kind, image, strength, end) {
  let cn = g.add("ControlNetLoader", { control_net_name: net.name }, "ControlNet · " + kind);
  if (net.union) cn = g.add("SetUnionControlNetType", { control_net: cn, type: UNION_TYPE[kind] }, "Union type: " + kind);
  const applied = g.add(
    "ControlNetApplyAdvanced",
    { positive: m.positive, negative: m.negative, control_net: cn, image, strength, start_percent: 0, end_percent: end, vae: m.vae },
    "Apply " + kind + " control",
  );
  return { positive: applied, negative: out(applied, 1) };
}
const repaintReady = (ctx) =>
  !!pickNet(fam(ctx).controlnets, "repaint") && ["ControlNetLoader", "SetUnionControlNetType", "ControlNetApplyAdvanced", "EmptyImage", "ThresholdMask"].every((t) => ctx.info[t]);

// Context-aware masked redraw shared by inpaint and outpaint (ProMax repaint when installed).
function maskedRedraw(g, m, p, ctx, image, mask, dims, denoise) {
  if (repaintReady(ctx)) {
    const hard = c.hardMask(g, mask);
    const black = g.add("EmptyImage", { width: dims.width, height: dims.height, batch_size: 1, color: 0 }, "Black fill");
    const control = g.add("ImageCompositeMasked", { destination: image, source: black, mask: hard, x: 0, y: 0, resize_source: false }, "Repaint control image");
    Object.assign(m, applyNet(g, m, pickNet(fam(ctx).controlnets, "repaint"), "repaint", control, c.clamp(p.context, 1, 0, 1.5), 1));
  } else g.note("ControlNet Union ProMax not installed: using plain masked sampling");
  let latent;
  if (denoise >= 0.99 && /inpaint/i.test(m.ckpt))
    latent = g.add("VAEEncodeForInpaint", { pixels: image, vae: m.vae, mask, grow_mask_by: 8 }, "Encode for inpainting checkpoint");
  else latent = g.add("SetLatentNoiseMask", { samples: c.encode(g, image, m.vae), mask }, "Limit to painted area");
  return sampleAndDecode(g, m, latent, p, denoise);
}

const baseNeeds = (ctx) => [need.model(fam(ctx).models.length, MODELS.sdxlBase, "SDXL checkpoint", "Any SDXL / Illustrious / NoobAI / Pony checkpoint")];
const netNeeds = (ctx, why, level = "required") => need.model(fam(ctx).controlnets.length, MODELS.sdxlUnion, "SDXL ControlNet (Union ProMax recommended)", why, level);
const common = [field.model(), field.loras()];
const advanced = [field.negative(NEGATIVE), field.seed(), field.sampling()];
const KINDS = [choice("canny", "Canny edges"), choice("lineart", "Line art"), choice("scribble", "Scribble / soft edge"), choice("depth", "Depth"), choice("pose", "Pose (skeleton)")];

export default {
  id: "sdxl",
  label: "SDXL",
  tagline: "SDXL · Illustrious · NoobAI · Pony",
  promptStyle: "Illustrious / NoobAI / Pony like tags; SDXL base and photo models like short sentences.",
  defaults: { ...SAMPLE, negative: NEGATIVE, width: 1024, height: 1024 },
  preferModel: PREFER,
  presets: { turbo: { label: "Turbo / Lightning", ...TURBO }, regular: { label: "Standard", ...SAMPLE } },
  baseNeeds,
  tasks: {
    generate: {
      fields: [field.prompt({ placeholder: "masterpiece, best quality, 1girl, red scarf, snowy street, evening light" }), ...common, field.size(), field.slider("batch", "Images", 1, 4, 1, 1), ...advanced],
      needs: baseNeeds,
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        return sampleAndDecode(g, m, g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas"), p);
      },
    },
    img2img: {
      fields: [field.image("image", "Source image"), field.prompt({ placeholder: "Describe the whole picture as it should look" }), field.slider("denoise", "Change strength", 0.05, 1, 0.01, 0.55, { hint: "Low keeps the picture, high redraws it" }), ...common, field.slider("batch", "Variations", 1, 4, 1, 1), ...advanced],
      needs: baseNeeds,
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const latent = c.repeatLatent(g, c.encode(g, c.loadImage(g, p.image, "Source image"), m.vae), c.int(p.batch, 1, 1, 4));
        return sampleAndDecode(g, m, latent, p, c.clamp(p.denoise, 0.55, 0.05, 1));
      },
    },
    inpaint: {
      fields: [field.image("image", "Image"), field.mask(), field.prompt({ placeholder: "What should appear in the painted area" }), field.slider("denoise", "Redraw strength", 0.1, 1, 0.01, 1, { hint: "1.0 replaces the area; 0.5 changes it gently" }), field.slider("context", "Match surroundings", 0, 1.5, 0.05, 1, { advanced: true, hint: "Strength of the Union ProMax repaint ControlNet" }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), need.model(pickNet(fam(ctx).controlnets, "repaint"), MODELS.sdxlUnion, "ControlNet Union SDXL ProMax", "Makes the fill match its surroundings", "recommended")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const src = c.loadImage(g, p.image, "Image");
        const mask = c.loadMask(g, p.mask);
        const { w, h } = c.sourceSize(p);
        const img = maskedRedraw(g, m, p, ctx, src, mask, { width: w, height: h }, c.clamp(p.denoise, 1, 0.1, 1));
        return c.composite(g, src, img, c.softEdge(g, mask, w, h));
      },
    },
    outpaint: {
      fields: [field.image("image", "Image"), field.edges(), field.prompt({ placeholder: "Describe the scenery to add (avoid repeating the subject)" }), field.select("fill", "Pre-fill", [choice("navier-stokes", "Smooth (recommended)"), choice("telea", "Telea"), choice("none", "None")], "navier-stokes", { advanced: true }), field.slider("denoise", "Redraw strength", 0.5, 1, 0.01, 1, { advanced: true }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), need.model(pickNet(fam(ctx).controlnets, "repaint"), MODELS.sdxlUnion, "ControlNet Union SDXL ProMax", "Continues the picture coherently", "recommended"), ...outpaintNeeds(ctx)],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const pad = c.padCanvas(g, c.loadImage(g, p.image, "Image"), p);
        const filled = c.edgeFill(g, pad.image, pad.mask, p);
        const base = filled || pad.image;
        const img = maskedRedraw(g, m, p, ctx, base, pad.mask, pad, filled ? c.clamp(p.denoise, 1, 0.5, 1) : 1);
        return c.composite(g, base, img, pad.mask);
      },
    },
    face: {
      fields: [field.image("image", "Image"), field.select("target", "Fix", [choice("face", "Whole face"), choice("eyes", "Eyes"), choice("lips", "Lips")], "face"), field.prompt({ optional: true, placeholder: "Optional: describe the face" }), field.slider("denoise", "Strength", 0.1, 0.9, 0.01, 0.4), field.slider("threshold", "Detection sensitivity", 0.1, 0.9, 0.01, 0.35, { advanced: true, hint: "Lower finds more (and smaller) faces" }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), ...detailerNeeds(ctx, "face")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p, "detailed face, sharp eyes"));
        return c.detailer(g, c.loadImage(g, p.image, "Image"), ctx, { ...m, sample: c.sampling(p, { ...SAMPLE, steps: 20 }) }, p, p.target || "face");
      },
    },
    hands: {
      fields: [field.image("image", "Image"), field.prompt({ optional: true, placeholder: "Optional: e.g. detailed hands, five fingers" }), field.slider("denoise", "Strength", 0.1, 0.9, 0.01, 0.45), field.slider("threshold", "Detection sensitivity", 0.1, 0.9, 0.01, 0.45, { advanced: true }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), ...detailerNeeds(ctx, "hand")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p, "detailed hands, five fingers"));
        return c.detailer(g, c.loadImage(g, p.image, "Image"), ctx, { ...m, sample: c.sampling(p, { ...SAMPLE, steps: 20 }) }, p, "hand");
      },
    },
    faceswap: {
      fields: [
        field.image("image", "Target image", { hint: "The picture whose face is replaced" }),
        field.image("face", "Face photo", { hint: "A clear, front-facing photo of the new face" }),
        field.toggle("blend", "Blend with SDXL", true, { hint: "A light SDXL face pass so the new face matches the picture" }),
        field.slider("denoise", "Blend strength", 0.1, 0.6, 0.01, 0.25, { when: "blend" }),
        field.prompt({ optional: true, placeholder: "Optional: describe the face (e.g. smiling woman, freckles)" }),
        field.select("restore", "Face restore", [choice("codeformer", "CodeFormer"), choice("gfpgan", "GFPGAN"), choice("none", "None")], "codeformer", { advanced: true }),
        field.select("targetFaces", "Faces to replace", [choice("0", "Largest face"), choice("0,1", "Two largest"), choice("0,1,2,3", "Up to four")], "0", { advanced: true }),
        ...common,
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...swapNeeds(ctx)],
      build(g, p, ctx) {
        let image = c.faceSwap(g, c.loadImage(g, p.image, "Target image"), c.loadImage(g, p.face, "Face photo"), p, ctx);
        if (p.blend === false) return image;
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p, "detailed face, natural skin"));
        return c.detailer(g, image, ctx, { ...m, sample: c.sampling(p, { ...SAMPLE, steps: 20 }) }, { ...p, denoise: c.clamp(p.denoise, 0.25, 0.1, 0.6) }, "face", "Blend new face (SDXL)");
      },
    },
    pose: {
      fields: [
        field.image("image", "Pose reference", { hint: "A photo or drawing of the pose, or a ready pose map" }),
        field.toggle("isMap", "Image is already a pose map", false),
        field.prompt({ placeholder: "Who is in the pose and where" }),
        field.size({ fromImage: true }),
        field.slider("strength", "Pose strength", 0.2, 1.5, 0.05, 0.9),
        field.toggle("depthGuide", "Also keep the silhouette (depth)", false, { hint: "Adds a light depth ControlNet from the same reference" }),
        field.slider("end", "Release control at", 0.3, 1, 0.05, 0.9, { advanced: true }),
        field.select("controlnet", "ControlNet", "controlnets", "", { advanced: true }),
        ...common,
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), netNeeds(ctx, "OpenPose-capable SDXL ControlNet"), need.node(ctx, "SetUnionControlNetType", PACKS.core, "Selects the pose mode of Union models", "recommended"), ...mapNeeds(ctx, ["pose"])],
      build(g, p, ctx) {
        const net = pickNet(fam(ctx).controlnets, "pose", p.controlnet);
        if (!net) throw c.missing("SDXL OpenPose / Union ControlNet", MODELS.sdxlUnion);
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        const ref = c.loadImage(g, p.image, "Pose reference");
        Object.assign(m, applyNet(g, m, net, "pose", c.controlMap(g, "pose", ref, p, { width, height }), c.clamp(p.strength, 0.9, 0, 2), c.clamp(p.end, 0.9, 0.1, 1)));
        if (p.depthGuide && !p.isMap) {
          const depthNet = pickNet(fam(ctx).controlnets, "depth");
          if (depthNet) Object.assign(m, applyNet(g, m, depthNet, "depth", c.controlMap(g, "depth", ref, p, { width, height }), 0.4, 0.6));
          else g.note("No SDXL depth ControlNet installed: silhouette guide skipped");
        }
        return sampleAndDecode(g, m, g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas"), p);
      },
    },
    control: {
      fields: [
        field.select("kind", "Control type", KINDS, "canny"),
        field.image("image", "Control image", { hint: "A picture to take the structure from, or a ready map" }),
        field.toggle("isMap", "Image is already a map", false),
        field.prompt({ placeholder: "Describe the new picture" }),
        field.size({ fromImage: true }),
        field.slider("strength", "Control strength", 0.1, 1.5, 0.05, 0.7),
        field.slider("end", "Release control at", 0.3, 1, 0.05, 0.8, { advanced: true, hint: "Lower lets the model finish details freely" }),
        field.select("controlnet", "ControlNet", "controlnets", "", { advanced: true }),
        field.toggle("invertMap", "Invert map", false, { advanced: true, hint: "SDXL nets expect white lines on black" }),
        ...common,
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), netNeeds(ctx, "Union ProMax covers every type"), need.node(ctx, "SetUnionControlNetType", PACKS.core, "Selects the mode of Union models", "recommended"), ...mapNeeds(ctx, ["lineart", "depth", "pose", "scribble"])],
      build(g, p, ctx) {
        const kind = UNION_TYPE[p.kind] && p.kind !== "repaint" ? p.kind : "canny";
        const net = pickNet(fam(ctx).controlnets, kind, p.controlnet);
        if (!net) throw c.missing(`SDXL ${kind} or Union ControlNet`, MODELS.sdxlUnion);
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        const map = c.controlMap(g, kind, c.loadImage(g, p.image, "Control image"), p, { width, height });
        Object.assign(m, applyNet(g, m, net, kind, map, c.clamp(p.strength, 0.7, 0, 2), c.clamp(p.end, 0.8, 0.1, 1)));
        return sampleAndDecode(g, m, g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas"), p);
      },
    },
    upscale: {
      fields: [field.image("image", "Image"), field.select("scale", "Scale", [choice(1.5, "1.5×"), choice(2, "2×"), choice(3, "3×"), choice(4, "4×")], 2), field.toggle("refine", "Add detail with SDXL", true, { hint: "A light second pass with your SDXL checkpoint" }), field.slider("refineDenoise", "Detail strength", 0.05, 0.6, 0.01, 0.3, { when: "refine" }), field.prompt({ optional: true, when: "refine", placeholder: "Optional: describe the picture for the detail pass" }), field.model({ when: "refine" }), field.select("upscaler", "Upscale model", "upscalers", "", { advanced: true }), field.slider("refineSteps", "Detail steps", 4, 40, 1, 12, { advanced: true, when: "refine" }), field.seed()],
      needs: (ctx) => [...upscaleNeeds(ctx), ...baseNeeds(ctx).map((n) => ({ ...n, level: "recommended", why: "Only for the detail pass" }))],
      build(g, p, ctx) {
        const src = c.loadImage(g, p.image, "Image");
        if (!p.refine) return c.upscaleRefine(g, src, p, ctx, null);
        const m = loaders(g, { ...p, loras: [] }, ctx);
        Object.assign(m, prompts(g, m, p, "highly detailed, sharp focus"));
        return c.upscaleRefine(g, src, p, ctx, { ...m, sample: c.sampling(p, { ...SAMPLE, sampler: "dpmpp_2m", scheduler: "karras" }), refineSteps: 12 });
      },
    },
  },
};
