// KREA 2 (Krea, June 2026): 12B DiT, Qwen Image VAE, Qwen3-VL 4B text encoder.
// Reference: Comfy-Org workflow_templates image_krea2_turbo_t2i and
// image_krea2_turbo_int8_image_style_reference (ComfyUI ≥ 0.26 has native support).
// UNETLoader → model-only LoRAs; CLIPLoader qwen3vl_4b (type krea2); VAELoader qwen_image_vae;
// EmptyLatentImage; Turbo: KSampler 8 steps, CFG 1, euler/simple, negative = ConditioningZeroOut.
// RAW (undistilled base): ~52 steps, CFG 4 with a real negative prompt.
// Control: the community depth Control-LoRA (comfyui-krea2-controlnet). No pose or canny
// control model exists for Krea 2 yet, so Pose is depth-guided and marked experimental.
import { field, choice, need } from "../fields.mjs";
import { MODELS, PACKS } from "../catalog.mjs";
import * as c from "../common.mjs";
import { detailerNeeds, swapNeeds, mapNeeds, upscaleNeeds, outpaintNeeds } from "../needs.mjs";

const TURBO = { steps: 8, cfg: 1, sampler: "euler", scheduler: "simple" };
const RAW = { steps: 52, cfg: 4, sampler: "euler", scheduler: "simple" };
const NEGATIVE = "blurry, low quality, deformed, watermark, text";
const fam = (ctx) => ctx.inv.families.krea2;
// Turbo vs RAW comes from the inventory (a turbo/ or regular/ folder, else the file name).
const PREFER = /krea2_turbo|turbo/i;
const defaultsFor = (ctx, name) => (fam(ctx).variants?.[name] === "regular" ? RAW : TURBO);

function loaders(g, p, ctx, { userLoras = true } = {}) {
  const f = fam(ctx);
  const unet = c.pick(f.models, p.model, PREFER, "Krea 2 model", MODELS.krea2Turbo);
  let model = g.add("UNETLoader", { unet_name: unet, weight_dtype: "default" }, "Krea 2 model");
  const clip = g.add("CLIPLoader", { clip_name: c.pick(f.clips, null, /qwen3vl_4b/i, "Krea 2 text encoder (Qwen3-VL 4B)", MODELS.krea2Clip), type: "krea2", device: "default" }, "Text encoder (Qwen3-VL 4B)");
  const vae = g.add("VAELoader", { vae_name: c.pick(f.vaes, null, /qwen_image_vae/i, "Qwen Image VAE", MODELS.qwenImageVae) }, "Qwen Image VAE");
  if (userLoras) ({ model } = c.applyLoras(g, { model, clip }, p.loras, f.loras, "Krea 2 LoRA", false));
  return { model, clip, vae, sample: c.sampling(p, defaultsFor(ctx, unet)) };
}
function negativeFor(g, m, p, positive) {
  return m.sample.cfg > 1.01 ? g.add("CLIPTextEncode", { text: String(p.negative ?? NEGATIVE), clip: m.clip }, "Negative prompt") : g.add("ConditioningZeroOut", { conditioning: positive }, "No negative (CFG 1)");
}
function prompts(g, m, p, fallback = "") {
  const positive = g.add("CLIPTextEncode", { text: String(p.prompt || fallback), clip: m.clip }, "Prompt");
  return { positive, negative: negativeFor(g, m, p, positive) };
}
const finish = (g, m, latent, denoise = 1) => c.decode(g, c.ksampler(g, { ...m, latent, sample: m.sample, denoise }), m.vae);

// Masked redraw: Krea 2 has no inpaint model, so differential diffusion + a latent noise mask.
function maskedRedraw(g, m, image, mask, denoise) {
  if (g.has("DifferentialDiffusion")) m.model = g.add("DifferentialDiffusion", { model: m.model }, "Differential diffusion");
  return finish(g, m, g.add("SetLatentNoiseMask", { samples: c.encode(g, image, m.vae), mask }, "Limit to painted area"), denoise);
}
// The depth Control-LoRA: one named "depth", else any control LoRA (loras/krea2/control/…) that is
// not named for another control type, so a file kept under its download name is found too.
const depthLora = (ctx) => {
  const list = fam(ctx).controlLoras || [];
  return list.find((n) => /depth/i.test(n)) || list.find((n) => !/canny|pose|line|normal|scribble|hed|tile/i.test(n.split(/[\\/]/).pop())) || null;
};
// Depth Control-LoRA (comfyui-krea2-controlnet): loader → encode control image → apply.
function depthControl(g, m, ctx, map, latent, p) {
  for (const t of ["Krea2ControlLoRALoader", "Krea2ControlImageEncode", "Krea2ControlApply"]) c.needNode(g, t, "Krea 2 depth control");
  const lora = p.controlLora ? c.pick(fam(ctx).controlLoras, p.controlLora, null, "Krea 2 depth Control LoRA", MODELS.krea2Depth) : depthLora(ctx);
  if (!lora) throw c.missing("Krea 2 depth Control LoRA", MODELS.krea2Depth);
  const patched = g.add("Krea2ControlLoRALoader", { model: m.model, lora_name: lora, strength: c.clamp(p.strength, 1, 0, 2) }, "Krea 2 depth Control LoRA");
  const encoded = g.add(
    "Krea2ControlImageEncode",
    { control_image: map, vae: m.vae, resize: "match_latent_size", upscale_method: "lanczos", crop: "center", channel_mode: "grayscale", normalize: "per_image_minmax", invert: false, batch_mode: "independent_images", latent },
    "Encode depth map",
  );
  m.model = g.add("Krea2ControlApply", { model: patched, control_latent: encoded }, "Apply depth control");
}

const baseNeeds = (ctx) => [
  need.model(fam(ctx).models, MODELS.krea2Turbo, "Krea 2 model (Turbo or RAW)", "The diffusion model"),
  need.model(fam(ctx).clips, MODELS.krea2Clip, "Qwen3-VL 4B text encoder", "Reads the prompt (type krea2)"),
  need.model(fam(ctx).vaes, MODELS.qwenImageVae, "Qwen Image VAE", "Encodes / decodes images"),
];
const depthNeeds = (ctx) => [
  need.node(ctx, "Krea2ControlLoRALoader", PACKS.krea2control, "Loads the control LoRA"),
  need.model(depthLora(ctx), MODELS.krea2Depth, "Krea 2 depth Control LoRA", "Depth control (loras/krea2/control/)"),
  ...mapNeeds(ctx, ["depth"]),
];
const common = [field.model(), field.loras()];
const advanced = [field.negative(NEGATIVE), field.seed(), field.sampling()];

export default {
  id: "krea2",
  label: "Krea 2",
  tagline: "Aesthetic & artistic · 12B",
  promptStyle: "Rich natural-language descriptions of subject, medium, style and light.",
  defaults: { ...TURBO, negative: NEGATIVE, width: 1024, height: 1024 },
  preferModel: PREFER,
  presets: { turbo: { label: "Turbo", ...TURBO }, regular: { label: "RAW", ...RAW } },
  baseNeeds,
  missing: {
    canny: "No public Krea 2 canny Control-LoRA.",
    lineart: "No public Krea 2 line-art Control-LoRA (one is announced by tori29umai).",
  },
  tasks: {
    generate: {
      evidence: "official",
      verified: "graph",
      fields: [
        field.prompt({ placeholder: "A surreal ink-and-photo illustration of a hand holding a martini glass, playful doodles on a clean white background" }),
        ...common,
        field.size(),
        field.slider("batch", "Images", 1, 4, 1, 1),
        field.image("style1", "Style reference", { optional: true, hint: "Optional: copy the look of an image (needs the krea2_style_reference LoRA)" }),
        field.image("style2", "Second style reference", { optional: true, when: "style1" }),
        field.slider("styleStrength", "Style strength", 0.2, 1.5, 0.05, 1, { when: "style1" }),
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), need.model(fam(ctx).styleLora, MODELS.krea2Style, "krea2_style_reference LoRA", "Optional style reference", "recommended")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        const { width, height, batch } = c.outputSize(p);
        const latent = g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas");
        const refs = [p.style1, p.style2].filter(Boolean);
        if (!refs.length) {
          Object.assign(m, prompts(g, m, p));
          return finish(g, m, latent);
        }
        // Official style-reference template: style LoRA + reference latents through
        // TextEncodeQwenImageEditPlus, index_timestep_zero, Flux-style shift for the size.
        if (!fam(ctx).styleLora) throw c.missing("krea2_style_reference LoRA", MODELS.krea2Style);
        m.model = g.add("LoraLoaderModelOnly", { model: m.model, lora_name: fam(ctx).styleLora, strength_model: c.clamp(p.styleStrength, 1, 0, 2) }, "Krea 2 style reference LoRA");
        const images = Object.fromEntries(refs.map((name, i) => ["image" + (i + 1), c.loadImage(g, name, i ? "Second style reference" : "Style reference")]));
        const encoded = g.add("TextEncodeQwenImageEditPlus", { clip: m.clip, vae: m.vae, prompt: String(p.prompt || ""), ...images }, "Prompt + style references");
        const positive = g.add("FluxKontextMultiReferenceLatentMethod", { conditioning: encoded, reference_latents_method: "index_timestep_zero" }, "Reference latent method");
        m.model = g.add("ModelSamplingFlux", { model: m.model, max_shift: 1.15, base_shift: 0.5, width, height }, "Sampling shift");
        return finish(g, { ...m, positive, negative: g.add("ConditioningZeroOut", { conditioning: positive }, "No negative") }, latent);
      },
    },
    img2img: {
      evidence: "composed",
      verified: "graph",
      fields: [field.image("image", "Source image"), field.prompt({ placeholder: "Describe the whole picture as it should look" }), field.slider("denoise", "Change strength", 0.05, 1, 0.01, 0.55), ...common, field.slider("batch", "Variations", 1, 4, 1, 1), ...advanced],
      needs: baseNeeds,
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const latent = c.repeatLatent(g, c.encode(g, c.loadImage(g, p.image, "Source image"), m.vae), c.int(p.batch, 1, 1, 4));
        return finish(g, m, latent, c.clamp(p.denoise, 0.55, 0.05, 1));
      },
    },
    edit: {
      evidence: "community",
      verified: "graph",
      badge: "Add-on",
      notes: ["Uses the Krea 2 Identity Edit LoRA and its nodes. Turbo at CFG 1 handles most edits; removals work better on RAW at CFG 3, ~20 steps."],
      fields: [
        field.image("image", "Image to edit"),
        field.prompt({ label: "Instruction", placeholder: "e.g. make the jacket red leather, keep everything else" }),
        field.image("image2", "Second image", { optional: true, hint: "Optional: a person to place into the first image" }),
        field.slider("refBoost", "Keep identity", 0.5, 1.5, 0.05, 1, { hint: "Higher stays closer to the original appearance" }),
        field.slider("grounding", "Grounding size", 384, 1536, 64, 768, { advanced: true, hint: "Lower follows the instruction more, higher keeps likeness (try 1024 for people)" }),
        ...common,
        ...advanced,
      ],
      needs: (ctx) => [
        ...baseNeeds(ctx),
        need.node(ctx, "Krea2EditModelPatch", PACKS.krea2edit, "Injects the source image"),
        need.node(ctx, "Krea2EditGroundedEncode", PACKS.krea2edit, "Lets the text encoder see the image"),
        need.model(fam(ctx).editLora, MODELS.krea2Edit, "Krea 2 Identity Edit LoRA", "The editing LoRA (loras/krea2/editor/)"),
      ],
      build(g, p, ctx) {
        for (const t of ["Krea2EditModelPatch", "Krea2EditGroundedEncode"]) c.needNode(g, t, "Smart Edit");
        if (!fam(ctx).editLora) throw c.missing("Krea 2 Identity Edit LoRA", MODELS.krea2Edit);
        const m = loaders(g, p, ctx);
        m.model = g.add("LoraLoaderModelOnly", { model: m.model, lora_name: fam(ctx).editLora, strength_model: 1 }, "Krea 2 Identity Edit LoRA");
        const src = c.loadImage(g, p.image, "Image to edit");
        const second = p.image2 ? c.loadImage(g, p.image2, "Second image") : undefined;
        // Output size follows the source, capped at ~2 MP (the LoRA's trained range).
        const { w, h } = c.sourceSize(p);
        const k = Math.min(1, Math.sqrt((2048 * 1024) / (w * h)));
        const latent = g.add("EmptySD3LatentImage", { width: c.round(w * k, 16), height: c.round(h * k, 16), batch_size: 1 }, "Output canvas");
        m.model = g.add(
          "Krea2EditModelPatch",
          // With vae + source_image (the pixel path) the node replaces its source list with the
          // images it is given, so the second image must also arrive as source_image_b.
          { model: m.model, source_latent: c.encode(g, src, m.vae), source_latent_b: second && c.encode(g, second, m.vae, "Encode second image"), vae: m.vae, source_image: src, source_image_b: second, target_latent: latent, fit_mode: "fit", ref_boost: c.clamp(p.refBoost, 1, 0, 3) },
          "Inject source image",
        );
        const grounding = c.int(p.grounding, 768, 256, 2048);
        const positive = g.add("Krea2EditGroundedEncode", { clip: m.clip, prompt: String(p.prompt || ""), image: src, image_b: second, grounding_px: grounding }, "Instruction (image-grounded)");
        const negative = m.sample.cfg > 1.01 ? g.add("Krea2EditGroundedEncode", { clip: m.clip, prompt: "", image: src, image_b: second, grounding_px: grounding }, "Empty instruction") : g.add("ConditioningZeroOut", { conditioning: positive }, "No negative (CFG 1)");
        return finish(g, { ...m, positive, negative }, latent);
      },
    },
    inpaint: {
      status: "partial",
      statusNote: "No Krea 2 inpaint model; differential diffusion + masked sampling",
      evidence: "composed",
      verified: "graph",
      fields: [field.image("image", "Image"), field.mask(), field.prompt({ placeholder: "What should appear in the painted area" }), field.slider("denoise", "Redraw strength", 0.1, 1, 0.01, 0.9), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), need.node(ctx, "DifferentialDiffusion", PACKS.core, "Soft-mask blending", "recommended")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const src = c.loadImage(g, p.image, "Image");
        const mask = c.loadMask(g, p.mask);
        const { w, h } = c.sourceSize(p);
        return c.composite(g, src, maskedRedraw(g, m, src, mask, c.clamp(p.denoise, 0.9, 0.1, 1)), c.softEdge(g, mask, w, h));
      },
    },
    outpaint: {
      status: "partial",
      statusNote: "No Krea 2 inpaint model; differential diffusion + masked sampling",
      evidence: "composed",
      verified: "graph",
      fields: [field.image("image", "Image"), field.edges(), field.prompt({ placeholder: "Describe the scenery to add (avoid repeating the subject)" }), field.select("fill", "Pre-fill", [choice("navier-stokes", "Smooth (recommended)"), choice("telea", "Telea"), choice("none", "None")], "navier-stokes", { advanced: true }), field.slider("denoise", "Redraw strength", 0.5, 1, 0.01, 1, { advanced: true }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), ...outpaintNeeds(ctx)],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const pad = c.padCanvas(g, c.loadImage(g, p.image, "Image"), p);
        const filled = c.edgeFill(g, pad.image, pad.mask, p);
        const base = filled || pad.image;
        return c.composite(g, base, maskedRedraw(g, m, base, pad.mask, filled ? c.clamp(p.denoise, 1, 0.5, 1) : 1), pad.mask);
      },
    },
    face: {
      evidence: "community",
      verified: "graph",
      fields: [field.image("image", "Image"), field.select("target", "Fix", [choice("face", "Whole face"), choice("eyes", "Eyes"), choice("lips", "Lips")], "face"), field.prompt({ optional: true, placeholder: "Optional: describe the face" }), field.slider("denoise", "Strength", 0.1, 0.9, 0.01, 0.35), field.slider("threshold", "Detection sensitivity", 0.1, 0.9, 0.01, 0.35, { advanced: true }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), ...detailerNeeds(ctx, "face")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p, "detailed face, natural skin texture"));
        return c.detailer(g, c.loadImage(g, p.image, "Image"), ctx, m, p, p.target || "face");
      },
    },
    hands: {
      evidence: "community",
      verified: "graph",
      fields: [field.image("image", "Image"), field.prompt({ optional: true, placeholder: "Optional: e.g. relaxed hands, five fingers" }), field.slider("denoise", "Strength", 0.1, 0.9, 0.01, 0.45), field.slider("threshold", "Detection sensitivity", 0.1, 0.9, 0.01, 0.45, { advanced: true }), ...common, ...advanced],
      needs: (ctx) => [...baseNeeds(ctx), ...detailerNeeds(ctx, "hand")],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p, "detailed hands, five fingers"));
        return c.detailer(g, c.loadImage(g, p.image, "Image"), ctx, m, p, "hand");
      },
    },
    faceswap: {
      evidence: "community",
      verified: "graph",
      fields: [
        field.image("image", "Target image", { hint: "The picture whose face is replaced" }),
        field.image("face", "Face photo", { hint: "A clear, front-facing photo of the new face" }),
        field.toggle("blend", "Blend with Krea 2", true, { hint: "A light Krea 2 face pass so the new face matches the picture" }),
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
        return c.detailer(g, image, ctx, m, { ...p, denoise: c.clamp(p.denoise, 0.25, 0.1, 0.6) }, "face", "Blend new face (Krea 2)");
      },
    },
    pose: {
      status: "experimental",
      statusNote: "Pose carried through a depth map (no pose model was used)",
      evidence: "composed",
      verified: "graph",
      badge: "Experimental",
      notes: ["No pose model exists for Krea 2 yet. This copies the pose through a depth map of the reference, so body shape and silhouette carry over too."],
      fields: [
        field.image("image", "Pose reference", { hint: "A photo of the pose (a depth map is made from it)" }),
        field.toggle("isMap", "Image is already a depth map", false),
        field.prompt({ placeholder: "Describe who is in the pose and where" }),
        field.size({ fromImage: true }),
        field.slider("strength", "Pose strength", 0.2, 1.5, 0.05, 0.8),
        ...common,
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...depthNeeds(ctx)],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        const latent = g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas");
        depthControl(g, m, ctx, c.controlMap(g, "depth", c.loadImage(g, p.image, "Pose reference"), p, { width, height }), latent, { ...p, strength: c.clamp(p.strength, 0.8, 0, 2) });
        return finish(g, m, latent);
      },
    },
    control: {
      status: "partial",
      statusNote: "Only a depth Control-LoRA is public",
      evidence: "community",
      verified: "graph",
      notes: ["Krea 2 currently has one public control model: depth (Patil/Krea-2-depth-controlnet)."],
      fields: [
        field.select("kind", "Control type", [{ ...choice("depth", "Depth"), status: "ready" }], "depth"),
        field.image("image", "Control image", { hint: "A picture to take the depth from, or a ready depth map" }),
        field.toggle("isMap", "Image is already a depth map", false),
        field.prompt({ placeholder: "Describe the new picture" }),
        field.size({ fromImage: true }),
        field.slider("strength", "Control strength", 0.2, 1.5, 0.05, 1),
        ...common,
        ...advanced,
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...depthNeeds(ctx)],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        const latent = g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas");
        depthControl(g, m, ctx, c.controlMap(g, "depth", c.loadImage(g, p.image, "Control image"), p, { width, height }), latent, p);
        return finish(g, m, latent);
      },
    },
    upscale: {
      evidence: "composed",
      verified: "graph",
      fields: [field.image("image", "Image"), field.select("scale", "Scale", [choice(1.5, "1.5×"), choice(2, "2×"), choice(3, "3×"), choice(4, "4×")], 2), field.toggle("refine", "Add detail with Krea 2", true), field.slider("refineDenoise", "Detail strength", 0.05, 0.6, 0.01, 0.3, { when: "refine" }), field.prompt({ optional: true, when: "refine", placeholder: "Optional: describe the picture for the detail pass" }), field.model({ when: "refine" }), field.select("upscaler", "Upscale model", "upscalers", "", { advanced: true }), field.slider("refineSteps", "Detail steps", 3, 40, 1, 8, { advanced: true, when: "refine" }), field.seed()],
      needs: (ctx) => [...upscaleNeeds(ctx), ...baseNeeds(ctx).map((n) => ({ ...n, level: "recommended", why: "Only for the detail pass" }))],
      build(g, p, ctx) {
        const src = c.loadImage(g, p.image, "Image");
        if (!p.refine) return c.upscaleRefine(g, src, p, ctx, null);
        const m = loaders(g, p, ctx, { userLoras: false });
        Object.assign(m, prompts(g, m, p, "highly detailed, sharp focus"));
        return c.upscaleRefine(g, src, p, ctx, { ...m, refineSteps: 8 });
      },
    },
  },
};
