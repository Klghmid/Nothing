// KREA 2 (Krea, June 2026): 12B DiT, Qwen Image VAE, Qwen3-VL 4B text encoder.
// Reference: Comfy-Org workflow_templates image_krea2_turbo_t2i and
// image_krea2_turbo_int8_image_style_reference (ComfyUI ≥ 0.26 has native support).
// UNETLoader → model-only LoRAs; CLIPLoader qwen3vl_4b (type krea2); VAELoader qwen_image_vae;
// EmptyLatentImage; Turbo: KSampler 8 steps, CFG 1, euler/simple, negative = ConditioningZeroOut.
// RAW (undistilled base): ~52 steps, CFG 4 with a real negative prompt.
// Control: depth through either the community depth Control-LoRA (comfyui-krea2-controlnet) or
// the UniDepth functional LoRA (ComfyUI-Krea2-UniDepth, depth + reference images); Pose through
// the OpenPose Control-LoRA and the Ostris Edit nodes. See docs/WORKFLOW_RESEARCH.md (Phases 4–6).
import { field, choice, need } from "../fields.mjs";
import { out, fail } from "../graph.mjs";
import { MODELS, PACKS } from "../catalog.mjs";
import * as c from "../common.mjs";
import { detailerNeeds, swapNeeds, mapNeeds, upscaleNeeds, outpaintNeeds } from "../needs.mjs";
import { createEditTasks } from "./krea2-edit.mjs";
import { withSceneTasks } from "../scene.mjs";

const TURBO = { steps: 8, cfg: 1, sampler: "euler", scheduler: "simple" };
const RAW = { steps: 52, cfg: 4, sampler: "euler", scheduler: "simple" };
const NEGATIVE = "blurry, low quality, deformed, watermark, text";
const fam = (ctx) => ctx.inv.families.krea2;
// Turbo vs RAW comes from the inventory (a turbo/ or regular/ folder, else the file name).
const PREFER = /krea2_turbo|turbo/i;
const defaultsFor = (ctx, name) => (fam(ctx).variants?.[name] === "regular" ? RAW : TURBO);

// `presets` overrides the family's Turbo / RAW defaults for a task (e.g. the edit suite);
// `prefer: "regular"` picks a RAW model when none was chosen (removals need real guidance).
function loaders(g, p, ctx, { userLoras = true, presets = null, prefer = null } = {}) {
  const f = fam(ctx);
  const preferred = !p.model && prefer ? f.models.find((n) => f.variants?.[n] === prefer) : null;
  const unet = preferred || c.pick(f.models, p.model, PREFER, "Krea 2 model", MODELS.krea2Turbo);
  let model = g.add("UNETLoader", { unet_name: unet, weight_dtype: "default" }, "Krea 2 model");
  const clip = g.add("CLIPLoader", { clip_name: c.pick(f.clips, null, /qwen3vl_4b/i, "Krea 2 text encoder (Qwen3-VL 4B)", MODELS.krea2Clip), type: "krea2", device: "default" }, "Text encoder (Qwen3-VL 4B)");
  const vae = g.add("VAELoader", { vae_name: c.pick(f.vaes, null, /qwen_image_vae/i, "Qwen Image VAE", MODELS.qwenImageVae) }, "Qwen Image VAE");
  if (userLoras) ({ model } = c.applyLoras(g, { model, clip }, p.loras, f.loras, "Krea 2 LoRA", false));
  const variant = f.variants?.[unet] === "regular" ? "regular" : "turbo";
  return { model, clip, vae, sample: c.sampling(p, presets?.[variant] || defaultsFor(ctx, unet)) };
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
// `guide(latent)` may add control that needs the sampler latent (depth-guided outpaint).
function maskedRedraw(g, m, image, mask, denoise, guide = null) {
  if (g.has("DifferentialDiffusion")) m.model = g.add("DifferentialDiffusion", { model: m.model }, "Differential diffusion");
  const latent = g.add("SetLatentNoiseMask", { samples: c.encode(g, image, m.vae), mask }, "Limit to painted area");
  guide?.(latent);
  return finish(g, m, latent, denoise);
}
// Krea 2 has two installed depth implementations, with different LoRAs that are never
// interchangeable:
//  "lora"     — Patil's depth Control-LoRA through comfyui-krea2-controlnet: it widens the input
//               projection, and the control latent must match the sampler latent.
//  "unidepth" — the UniDepth functional LoRA through ComfyUI-Krea2-UniDepth: the depth map (and
//               optional reference images) ride Krea 2's native clean reference path, with one
//               conditioning window and optional calibration.
const fileName = (n) => n.split(/[\\/]/).pop();
// The depth Control-LoRA: one named "depth", else any control LoRA (loras/krea2/control/…) that is
// not named for another control type, so a file kept under its download name is found too.
const depthLora = (ctx) => {
  const list = (fam(ctx).controlLoras || []).filter((n) => !/unidepth|pose/i.test(fileName(n)));
  return list.find((n) => /depth/i.test(n)) || list.find((n) => !/canny|line|normal|scribble|hed|tile/i.test(fileName(n))) || null;
};
const unidepthLora = (ctx) => fam(ctx).unidepthLoras?.[0] || null;
const poseLora = (ctx) => fam(ctx).poseLoras?.[0] || null;
const unidepthReady = (ctx) => !!(ctx.info?.Krea2UniDepthConditioning && unidepthLora(ctx));
// UniDepth when chosen, or when it is the only depth implementation installed.
const depthMethod = (p, ctx) => (p.method === "unidepth" || (!depthLora(ctx) && unidepthReady(ctx)) ? "unidepth" : "lora");

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

// UniDepth (ComfyUI-Krea2-UniDepth, its documented depth workflow): Functional LoRA Loader →
// sampler model; prompts → UniDepth Conditioning (depth map first, then the optional reference
// image and a second stacked reference) → sampler positive / negative / latent. Every section
// strength stays 1.0 (the pack's baseline); `latent` (img2img) sets the output geometry.
const FITS = [choice("center_crop", "Crop to fit"), choice("letterbox", "Fit inside (pad)"), choice("stretch", "Stretch")];
function uniDepth(g, m, ctx, map, p, { width, height, batch = 1, latent = null }) {
  for (const t of ["Krea2UniDepthLoRALoader", "Krea2UniDepthConditioning"]) c.needNode(g, t, "Krea 2 UniDepth");
  const lora = unidepthLora(ctx);
  if (!lora) throw c.missing("Krea 2 UniDepth depth LoRA", MODELS.krea2UniDepth);
  const one = { early_blocks: 1, middle_blocks: 1, late_blocks: 1, text_fusion: 1, attention: 1, mlp: 1, other: 1 };
  m.model = g.add("Krea2UniDepthLoRALoader", { model: m.model, lora_name: lora, base_strength: c.clamp(p.strength, 1, 0, 2), ...one }, "UniDepth depth LoRA");
  const fit = FITS.some((f) => f.value === p.fit) ? p.fit : "center_crop";
  const refs = {};
  if (p.ref1) refs.image = c.loadImage(g, p.ref1, "Reference image");
  if (p.ref1 && p.ref2) refs.references = g.add("Krea2UniDepthReferenceStack", { image: c.loadImage(g, p.ref2, "Second reference"), fit_mode: fit, image_mode: "rgb", pad_value: 0 }, "Second reference");
  const start = c.clamp(p.start, 0, 0, 0.9);
  const end = Math.max(start + 0.05, c.clamp(p.end, 1, 0.1, 1));
  const cond = g.add(
    "Krea2UniDepthConditioning",
    {
      positive: m.positive, negative: m.negative, vae: m.vae, depth_image: map, width, height, batch_size: batch, fit_mode: fit, negative_policy: "same reference",
      start_percent: start, end_percent: end, pad_value: 0, calibrate: !!p.calibrate, low_percent: 1, high_percent: 99, gamma: c.clamp(p.gamma, 1, 0.1, 4), polarity: "keep",
      smoothing_radius: 0, smoothing_strength: 0, edge_epsilon: 0.01, ...(latent ? { target_latent: latent } : {}), ...refs,
    },
    "UniDepth conditioning",
  );
  m.positive = cond;
  m.negative = out(cond, 1);
  return out(cond, 2);
}
// Fields of the depth choice: the method (UniDepth only offered when installed) and the
// UniDepth-only options, verified against the installed node's inputs.
const isUni = { key: "method", is: ["unidepth"] };
const depthFields = ({ refs = true } = {}) => [
  field.select("method", "Depth method", [{ ...choice("lora", "Depth Control-LoRA"), status: "ready" }, { ...choice("unidepth", "UniDepth"), status: "experimental", feature: "unidepth" }], "lora", { hint: "UniDepth can also keep the look of reference images" }),
  ...(refs
    ? [
        field.image("ref1", "Reference image", { optional: true, when: isUni, hint: "Optional: its look is kept while the depth sets the layout" }),
        field.image("ref2", "Second reference", { optional: true, when: "ref1" }),
      ]
    : []),
  field.select("fit", "Fit depth and references", FITS, "center_crop", { advanced: true, when: isUni }),
  field.slider("start", "Guide from", 0, 0.9, 0.05, 0, { advanced: true, when: isUni }),
  field.slider("end", "Guide until", 0.1, 1, 0.05, 1, { advanced: true, when: isUni, hint: "0.65–0.85 keeps the structure but frees late detail" }),
  field.toggle("calibrate", "Calibrate depth map", false, { advanced: true, when: isUni, hint: "Robust 1–99% range, for maps that look flat" }),
  field.slider("gamma", "Depth gamma", 0.5, 2, 0.05, 1, { advanced: true, when: "calibrate" }),
];

// Style reference (official template image_krea2_turbo_int8_image_style_reference): style LoRA +
// reference latents through TextEncodeQwenImageEditPlus, index_timestep_zero, Flux-style shift for
// the output size, CFG 1 with a zeroed negative. `latent`/`denoise` redraw a source image.
function styleReference(g, m, ctx, p, refs, { latent, width, height, denoise = 1 }) {
  if (!fam(ctx).styleLora) throw c.missing("krea2_style_reference LoRA", MODELS.krea2Style);
  m.model = g.add("LoraLoaderModelOnly", { model: m.model, lora_name: fam(ctx).styleLora, strength_model: c.clamp(p.styleStrength, 1, 0, 2) }, "Krea 2 style reference LoRA");
  const titles = ["Style reference", "Second style reference", "Third style reference"];
  const images = Object.fromEntries(refs.map((name, i) => ["image" + (i + 1), c.loadImage(g, name, titles[i])]));
  const encoded = g.add("TextEncodeQwenImageEditPlus", { clip: m.clip, vae: m.vae, prompt: String(p.prompt || ""), ...images }, "Prompt + style references");
  const positive = g.add("FluxKontextMultiReferenceLatentMethod", { conditioning: encoded, reference_latents_method: "index_timestep_zero" }, "Reference latent method");
  m.model = g.add("ModelSamplingFlux", { model: m.model, max_shift: 1.15, base_shift: 0.5, width, height }, "Sampling shift");
  return finish(g, { ...m, positive, negative: g.add("ConditioningZeroOut", { conditioning: positive }, "No negative") }, latent, denoise);
}

// Pose (thedeoxen/Krea-2-pose-controlnet, its published workflow): UNETLoader → Ostris Edit
// model patch (reference K/V cache on, as published) → the OpenPose LoRA → KSampler 10 steps,
// CFG 1, euler/simple. The skeleton is image 1 of TextEncodeKrea2OstrisEdit (with the VAE, so it
// is also a reference latent) → index_timestep_zero, for the prompt and the empty negative.
const POSE = { steps: 10, cfg: 1, sampler: "euler", scheduler: "simple" };
function poseConditioning(g, m, map, text, title) {
  const encoded = g.add("TextEncodeKrea2OstrisEdit", { clip: m.clip, prompt: text, vae: m.vae, image1: map }, title);
  return g.add("FluxKontextMultiReferenceLatentMethod", { conditioning: encoded, reference_latents_method: "index_timestep_zero" }, `${title} · reference method`);
}

// Krea 2's own masked redraw before paste-back, for Background Replace.
function redraw(g, p, ctx, image, mask, denoise) {
  const m = loaders(g, p, ctx);
  Object.assign(m, prompts(g, m, p));
  return maskedRedraw(g, m, image, mask, denoise);
}

const baseNeeds = (ctx) => [
  need.model(fam(ctx).models, MODELS.krea2Turbo, "Krea 2 model (Turbo or RAW)", "The diffusion model"),
  need.model(fam(ctx).clips, MODELS.krea2Clip, "Qwen3-VL 4B text encoder", "Reads the prompt (type krea2)"),
  need.model(fam(ctx).vaes, MODELS.qwenImageVae, "Qwen Image VAE", "Encodes / decodes images"),
];
// Depth needs one complete implementation: the Control-LoRA path, or UniDepth when only it is
// installed (the method picker then offers UniDepth alone).
const depthNeeds = (ctx) =>
  !depthLora(ctx) && unidepthReady(ctx)
    ? [
        need.node(ctx, "Krea2UniDepthConditioning", PACKS.krea2unidepth, "Adds the depth map as a reference"),
        need.model(unidepthLora(ctx), MODELS.krea2UniDepth, "Krea 2 UniDepth depth LoRA", "Depth guidance (loras/krea2/)"),
        ...mapNeeds(ctx, ["depth"]),
      ]
    : [
        need.node(ctx, "Krea2ControlLoRALoader", PACKS.krea2control, "Loads the control LoRA"),
        need.model(depthLora(ctx), MODELS.krea2Depth, "Krea 2 depth Control LoRA", "Depth control (loras/krea2/control/)"),
        ...mapNeeds(ctx, ["depth"]),
      ];
const poseNeeds = (ctx) => [
  need.node(ctx, "Krea2OstrisEditModelPatch", PACKS.krea2ostris, "Lets Krea 2 read the pose map"),
  need.node(ctx, "TextEncodeKrea2OstrisEdit", PACKS.krea2ostris, "Encodes the prompt with the pose map"),
  need.model(poseLora(ctx), MODELS.krea2Pose, "Krea 2 OpenPose Control-LoRA", "Pose control (loras/krea2/control/)"),
  ...mapNeeds(ctx, ["pose"]),
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
  // Choices offered only when their implementation is installed (see depthFields, outpaint).
  features: (ctx) => ({ unidepth: unidepthReady(ctx), depthGuide: !!depthLora(ctx) && !!c.preprocessorFor(ctx.info, "depth") }),
  // Combinations asked for in the expansion plan (Phases 4–6). Entries with `from` take their
  // status from that task / choice; the others carry the reason they are not offered.
  // Evidence for every reason: docs/WORKFLOW_RESEARCH.md, "Phases 4–6".
  combinations: [
    { label: "Style + Prompt", from: { task: "style", choice: { key: "mode", value: "prompt" } } },
    { label: "Style + Img2Img", from: { task: "style", choice: { key: "mode", value: "img2img" } } },
    {
      label: "Style + Identity",
      status: "unsupported",
      note: "The Identity Edit patch (comfyui-krea2edit) replaces the model forward and ignores Krea 2's native reference latents, so the style references would be silently dropped.",
    },
    {
      label: "Style + Depth",
      status: "research",
      note: "With the depth Control-LoRA the style reference tokens break its control-token count (\"Krea2 control token count mismatch\"); UniDepth overwrites the style reference latents. No tested combination exists.",
    },
    { label: "Style + Pose", status: "research", note: "The style LoRA and the pose LoRA each expect their own image as reference 1; no tested combination exists." },
    { label: "Depth + Prompt", from: { task: "control", choice: { key: "method", value: "lora" } } },
    { label: "Depth + Source image (img2img)", from: { task: "img2img-control" } },
    { label: "Depth + Reference images", from: { task: "control", choice: { key: "method", value: "unidepth" } }, note: "UniDepth: one reference image plus a second stacked one" },
    { label: "Depth conditioning range", from: { task: "control", choice: { key: "method", value: "unidepth" } }, note: "UniDepth only, one start/end window for the depth map and its references together; the Control-LoRA nodes have no range" },
    {
      label: "Depth + Identity",
      status: "unsupported",
      note: "The Identity Edit patch ignores reference latents (so UniDepth's depth map is dropped) and runs the input projection once per source image, so the depth Control-LoRA would add the depth map to the source images too, or stop with a token-count mismatch when their sizes differ.",
    },
    { label: "Depth-guided outpaint", from: { task: "outpaint", choice: { key: "guide", value: "depth" } } },
    { label: "Depth-guided reframe", from: { task: "reframe", choice: { key: "guide", value: "depth" } } },
    { label: "Pose → Image", from: { task: "pose" } },
    { label: "Pose + Source image", from: { task: "pose", field: "source" }, evidence: "composed", note: "Img2img start latent with the pose LoRA (Wire Studio composition)" },
    { label: "Pose + Identity", from: { task: "k2-pose" }, note: "Pose Restage in the Identity Edit suite" },
    { label: "Pose + Style", status: "research", note: "The OpenPose LoRA's author describes it as \"not a reference + pose fusion model\"; no tested combination with the style LoRA exists." },
    { label: "Pose + Identity + Style", status: "research", note: "Needs Pose + Style first (see above); the Identity Edit patch also ignores the other references." },
  ],
  missing: {
    canny: "No public Krea 2 canny Control-LoRA.",
    lineart: "No public Krea 2 line-art Control-LoRA (one is announced by tori29umai).",
    reference: "Style only (Style Reference); for a person or object use the Identity Edit suite.",
    "identity-ref": "Use the Identity Edit suite (Character Restage / Sheet / Variation) with a photo of the person.",
    "multi-control": "Only depth control exists (two implementations that cannot be combined); pose uses a separate path.",
  },
  tasks: withSceneTasks({
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
        return styleReference(g, m, ctx, p, refs, { latent, width, height });
      },
    },
    style: {
      evidence: "official",
      verified: "graph",
      notes: ["The official Krea 2 style-reference workflow: the krea2_style_reference LoRA reads up to three reference images. Redrawing an existing image in the style is Wire Studio's own combination (experimental)."],
      fields: [
        field.select("mode", "Start from", [{ ...choice("prompt", "A prompt"), status: "ready" }, { ...choice("img2img", "An image (redraw it in the style)"), status: "experimental", evidence: "composed" }], "prompt"),
        field.image("image", "Source image", { when: { key: "mode", is: ["img2img"] }, hint: "The picture to redraw in the style" }),
        field.image("style1", "Style reference"),
        field.image("style2", "Second style reference", { optional: true }),
        field.image("style3", "Third style reference", { optional: true, when: "style2" }),
        field.prompt({ placeholder: "Describe the picture; the references give its look" }),
        field.slider("denoise", "Change strength", 0.3, 1, 0.01, 0.75, { when: { key: "mode", is: ["img2img"] }, hint: "How much of the source is redrawn" }),
        field.slider("styleStrength", "Style strength", 0.2, 1.5, 0.05, 1),
        field.size({ when: { key: "mode", is: ["prompt"] } }),
        field.slider("batch", "Images", 1, 4, 1, 1, { when: { key: "mode", is: ["prompt"] } }),
        ...common,
        ...advanced,
      ],
      example: { style1: "style.png" },
      variants: [
        { label: "prompt", params: { mode: "prompt" } },
        { label: "img2img", params: { mode: "img2img" } },
      ],
      needs: (ctx) => [...baseNeeds(ctx), need.model(fam(ctx).styleLora, MODELS.krea2Style, "krea2_style_reference LoRA", "Reads the style references")],
      build(g, p, ctx) {
        const refs = [p.style1, p.style2, p.style2 && p.style3].filter(Boolean);
        if (!refs.length) throw fail("Add a style reference first");
        const m = loaders(g, p, ctx);
        if (p.mode === "img2img") {
          const { w, h } = c.sourceSize(p);
          const width = c.round(w, 16), height = c.round(h, 16);
          const latent = c.encode(g, c.scaleImage(g, c.loadImage(g, p.image, "Source image"), width, height, "disabled", "Fit source to /16"), m.vae);
          return styleReference(g, m, ctx, p, refs, { latent, width, height, denoise: c.clamp(p.denoise, 0.75, 0.05, 1) });
        }
        const { width, height, batch } = c.outputSize(p);
        return styleReference(g, m, ctx, p, refs, { latent: g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas"), width, height });
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
      fields: [
        field.image("image", "Image"),
        field.edges(),
        field.prompt({ placeholder: "Describe the scenery to add (avoid repeating the subject)" }),
        field.select("guide", "Guide", [choice("none", "None"), { ...choice("depth", "Depth of the extended picture"), status: "experimental", evidence: "composed", feature: "depthGuide" }], "none", { hint: "Depth control keeps the new area's layout consistent with the picture" }),
        field.slider("guideStrength", "Guide strength", 0.2, 1.2, 0.05, 0.6, { when: { key: "guide", is: ["depth"] } }),
        field.select("fill", "Pre-fill", [choice("navier-stokes", "Smooth (recommended)"), choice("telea", "Telea"), choice("none", "None")], "navier-stokes", { advanced: true }),
        field.slider("denoise", "Redraw strength", 0.5, 1, 0.01, 1, { advanced: true }),
        ...common,
        ...advanced,
      ],
      variants: [
        { label: "", params: {} },
        { label: "depth", params: { guide: "depth" } },
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...outpaintNeeds(ctx)],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const pad = c.padCanvas(g, c.loadImage(g, p.image, "Image"), p);
        const filled = c.edgeFill(g, pad.image, pad.mask, p);
        const base = filled || pad.image;
        // Depth guide: the depth of the pre-filled canvas, through the depth Control-LoRA (its
        // control latent is sized to the padded sampler latent).
        const guide =
          p.guide === "depth"
            ? (latent) => depthControl(g, m, ctx, c.controlMap(g, "depth", base, { ...p, isMap: false }, { width: pad.width, height: pad.height }), latent, { ...p, strength: c.clamp(p.guideStrength, 0.6, 0, 2) })
            : null;
        return c.composite(g, base, maskedRedraw(g, m, base, pad.mask, filled ? c.clamp(p.denoise, 1, 0.5, 1) : 1, guide), pad.mask);
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
      statusNote: "Community OpenPose Control-LoRA, run as its author's workflow; not yet run on a GPU here",
      evidence: "community",
      verified: "graph",
      badge: "Experimental",
      notes: [
        "Uses the Krea 2 OpenPose Control-LoRA (thedeoxen) with the Ostris Edit nodes, as in its published workflow: the body follows the skeleton, looks come from the prompt.",
        "To keep a particular person's identity in a new pose, use Pose Restage (Identity Edit).",
      ],
      fields: [
        field.image("image", "Pose reference", { hint: "A photo of the pose, or a pose skeleton" }),
        field.toggle("isSkeleton", "Image is already a pose skeleton", false, { hint: "An OpenPose / DWPose map (black background)" }),
        field.prompt({ placeholder: "Describe who is in the pose, their clothes and the scene" }),
        field.size({ fromImage: true }),
        field.slider("strength", "Pose strength", 0.4, 1.2, 0.05, 1, { hint: "0.8–1.0 recommended; lower if the pose looks stiff" }),
        field.image("source", "Start from an image", { optional: true, advanced: true, hint: "Optional (experimental): redraw this image into the pose" }),
        field.slider("denoise", "Change strength", 0.3, 1, 0.01, 0.75, { advanced: true, when: "source" }),
        field.toggle("kvCache", "Reference cache", true, { advanced: true, hint: "On in the LoRA's published workflow" }),
        ...common,
        ...advanced,
      ],
      variants: [
        { label: "", params: {} },
        { label: "source", params: { source: "input.png" } },
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...poseNeeds(ctx)],
      build(g, p, ctx) {
        for (const t of ["Krea2OstrisEditModelPatch", "TextEncodeKrea2OstrisEdit"]) c.needNode(g, t, "Krea 2 pose");
        const lora = poseLora(ctx);
        if (!lora) throw c.missing("Krea 2 OpenPose Control-LoRA", MODELS.krea2Pose);
        const m = loaders(g, p, ctx, { presets: { turbo: POSE } });
        m.model = g.add("Krea2OstrisEditModelPatch", { model: m.model, kv_cache: p.kvCache !== false }, "Reference patch (Ostris Edit)");
        m.model = g.add("LoraLoaderModelOnly", { model: m.model, lora_name: lora, strength_model: c.clamp(p.strength, 1, 0, 1.5) }, "Krea 2 pose LoRA");
        const { width, height, batch } = c.outputSize(p);
        const map = c.controlMap(g, "pose", c.loadImage(g, p.image, "Pose reference"), { ...p, isMap: !!p.isSkeleton }, { width, height });
        m.positive = poseConditioning(g, m, map, String(p.prompt || ""), "Prompt + pose map");
        m.negative = poseConditioning(g, m, map, m.sample.cfg > 1.01 ? String(p.negative ?? NEGATIVE) : "", "Negative + pose map");
        if (p.source) {
          const latent = c.encode(g, c.scaleImage(g, c.loadImage(g, p.source, "Start image"), width, height, "center", "Fit start image to output size"), m.vae);
          return finish(g, m, latent, c.clamp(p.denoise, 0.75, 0.05, 1));
        }
        return finish(g, m, g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas"));
      },
    },
    control: {
      status: "partial",
      statusNote: "Only depth control models are public",
      evidence: "community",
      verified: "graph",
      notes: [
        "Krea 2 currently has public depth control only: the depth Control-LoRA (Patil/Krea-2-depth-controlnet) and, with ComfyUI-Krea2-UniDepth, the UniDepth LoRA, which can also keep the look of reference images.",
      ],
      fields: [
        field.select("kind", "Control type", [{ ...choice("depth", "Depth"), status: "ready" }], "depth"),
        ...depthFields(),
        field.image("image", "Control image", { hint: "A picture to take the depth from, or a ready depth map" }),
        field.toggle("isMap", "Image is already a depth map", false),
        field.prompt({ placeholder: "Describe the new picture" }),
        field.size({ fromImage: true }),
        field.slider("strength", "Control strength", 0.2, 1.5, 0.05, 1),
        ...common,
        ...advanced,
      ],
      variants: [
        { label: "depth", params: { kind: "depth" } },
        { label: "depth-unidepth", params: { kind: "depth", method: "unidepth", ref1: "ref.png", ref2: "style.png", end: 0.8, calibrate: true } },
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...depthNeeds(ctx)],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const { width, height, batch } = c.outputSize(p);
        const map = c.controlMap(g, "depth", c.loadImage(g, p.image, "Control image"), p, { width, height });
        if (depthMethod(p, ctx) === "unidepth") return finish(g, m, uniDepth(g, m, ctx, map, p, { width, height, batch }));
        const latent = g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas");
        depthControl(g, m, ctx, map, latent, p);
        return finish(g, m, latent);
      },
    },
    "img2img-control": {
      status: "experimental",
      statusNote: "Wire Studio's combination of img2img and depth control; not yet run on a GPU",
      evidence: "composed",
      verified: "graph",
      notes: ["Redraws the source while depth control keeps its layout. The depth is taken from the source unless you add a separate control image."],
      fields: [
        field.image("image", "Source image"),
        field.select("kind", "Keep from the source", [{ ...choice("depth", "Depth"), status: "experimental" }], "depth"),
        ...depthFields({ refs: false }),
        field.prompt({ placeholder: "Describe the whole picture as it should look" }),
        field.slider("denoise", "Change strength", 0.2, 1, 0.01, 0.65, { hint: "How much is redrawn; the depth keeps the layout" }),
        field.slider("strength", "Control strength", 0.2, 1.5, 0.05, 0.9),
        field.image("control", "Separate control image", { optional: true, advanced: true, hint: "Optional: take the depth from another image (or a ready map)" }),
        field.toggle("isMap", "Control image is already a depth map", false, { advanced: true, when: "control" }),
        ...common,
        ...advanced,
      ],
      variants: [
        { label: "depth", params: { kind: "depth" } },
        { label: "depth-unidepth", params: { kind: "depth", method: "unidepth" } },
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...depthNeeds(ctx)],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const src = c.loadImage(g, p.image, "Source image");
        const { w, h } = c.sourceSize(p);
        const width = c.round(w, 16), height = c.round(h, 16);
        const ref = p.control ? c.loadImage(g, p.control, "Control image") : src;
        const map = c.controlMap(g, "depth", ref, { ...p, isMap: !!(p.control && p.isMap) }, { width, height });
        let latent = c.encode(g, c.scaleImage(g, src, width, height, "disabled", "Fit source to /16"), m.vae);
        if (depthMethod(p, ctx) === "unidepth") latent = uniDepth(g, m, ctx, map, p, { width, height, latent });
        else depthControl(g, m, ctx, map, latent, p);
        return finish(g, m, latent, c.clamp(p.denoise, 0.65, 0.05, 1));
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
    // Identity Edit suite (Smart Edit and 18 dedicated edit tasks): krea2-edit.mjs.
    ...createEditTasks({ fam, loaders, baseNeeds }),
  }, { redraw: redraw, baseNeeds, common, advanced, label: "Krea 2", reframeVariants: [{ label: "depth", params: { target: "aspect", aspect: "16:9", guide: "depth" } }] }),
};
