// Building blocks shared by the family modules. Nothing here loads a diffusion model:
// families pass their own model / CLIP / VAE in, so every workflow stays family-pure.
import { fail, out, options } from "./graph.mjs";
import { MODELS, PACKS } from "./catalog.mjs";

export const clamp = (v, d, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
export const int = (v, d, min, max) => Math.round(clamp(v, d, min, max));
export const round = (v, step = 8) => Math.max(step, Math.round(Number(v) / step) * step);
const short = (name) => String(name).split(/[\\/]/).pop().replace(/\.(safetensors|ckpt|pt|pth|onnx)$/i, "");

export function seedOf(p) {
  const s = Number(p.seed);
  return Number.isFinite(s) && s >= 0 ? Math.floor(s) % 2 ** 50 : Math.floor(Math.random() * 2 ** 48);
}

// Choose an installed file: the requested one, else the preferred match, else the first.
export function pick(list, wanted, prefer, label, model) {
  list = list || [];
  if (wanted) {
    if (list.includes(wanted)) return wanted;
    throw fail(`${label} "${short(wanted)}" is not installed for this family`, { missing: { models: [{ label, ...model }] } });
  }
  const found = (prefer && list.find((n) => prefer.test(n))) || list[0];
  if (!found) throw fail(`No ${label} is installed`, { missing: { models: [{ label, ...model }] } });
  return found;
}

export const missing = (label, model) => fail(`No ${label} is installed`, { missing: { models: [{ label, ...model }] } });

export function needNode(g, type, why) {
  if (!g.has(type)) throw fail(`${why} needs the ${type} node`, { missing: { nodes: [{ type }] } });
}

export function sampling(p, d) {
  return {
    seed: seedOf(p),
    steps: int(p.steps, d.steps, 1, 150),
    cfg: clamp(p.cfg, d.cfg, 0, 30),
    sampler_name: p.sampler || d.sampler,
    scheduler: p.scheduler || d.scheduler,
  };
}

export function ksampler(g, { model, positive, negative, latent, sample, denoise = 1, title = "Sampler" }) {
  return g.add("KSampler", { model, positive, negative, latent_image: latent, ...sample, denoise }, title);
}
export const decode = (g, samples, vae, title = "Decode") => g.add("VAEDecode", { samples, vae }, title);
export const encode = (g, pixels, vae, title = "Encode image") => g.add("VAEEncode", { pixels, vae }, title);

// LoRAs are only accepted from the family's own list (the inventory sorts them).
export function applyLoras(g, { model, clip }, loras, allowed, label, withClip) {
  for (const l of loras || []) {
    if (!l || l.on === false || !l.name) continue;
    if (!allowed.includes(l.name))
      throw fail(`"${short(l.name)}" is not a ${label} (assign it to this family in the Library if it is one)`);
    const s = clamp(l.strength, 1, -4, 4);
    if (withClip) {
      const n = g.add("LoraLoader", { model, clip, lora_name: l.name, strength_model: s, strength_clip: s }, "LoRA · " + short(l.name));
      model = n;
      clip = out(n, 1);
    } else model = g.add("LoraLoaderModelOnly", { model, lora_name: l.name, strength_model: s }, "LoRA · " + short(l.name));
  }
  return { model, clip };
}

export function outputSize(p, d = 1024) {
  const width = round(clamp(p.width, d, 256, 2048), 16);
  const height = round(clamp(p.height, d, 256, 2048), 16);
  return { width, height, batch: int(p.batch, 1, 1, 4) };
}
export function sourceSize(p) {
  const w = Number(p.imageW), h = Number(p.imageH);
  if (!(w > 0 && h > 0)) throw fail("The input image size is unknown; add the image again");
  return { w, h };
}

export function loadImage(g, name, title = "Input image") {
  if (!name) throw fail(`Add the ${title.toLowerCase()} first`);
  return g.add("LoadImage", { image: String(name) }, title);
}
export function loadMask(g, name) {
  if (!name) throw fail("Paint the area to change first");
  const img = g.add("LoadImage", { image: String(name) }, "Painted mask");
  return g.add("ImageToMask", { image: img, channel: "red" }, "Mask");
}
export const scaleImage = (g, image, width, height, crop = "disabled", title = "Resize") =>
  g.add("ImageScale", { image, upscale_method: "lanczos", width, height, crop }, title);

// Feathered paste-back edge (the "mask blur" of other UIs), scaled to the image size.
export function softEdge(g, mask, w = 1024, h = 1024) {
  if (!["MaskToImage", "ImageBlur", "ImageToMask"].every((t) => g.has(t))) return mask;
  const r = Math.max(3, Math.min(8, Math.round(Math.max(w, h) / 256)));
  const img = g.add("MaskToImage", { mask }, "Soft edge");
  const blur = g.add("ImageBlur", { image: img, blur_radius: r, sigma: r / 2 }, "Soft edge blur");
  return g.add("ImageToMask", { image: blur, channel: "red" }, "Soft edge mask");
}
export const hardMask = (g, mask) => (g.has("ThresholdMask") ? g.add("ThresholdMask", { mask, value: 0.5 }, "Binary mask") : mask);
export const composite = (g, destination, source, mask) =>
  g.add("ImageCompositeMasked", { destination, source, mask, x: 0, y: 0, resize_source: false }, "Paste result into original");

export function padCanvas(g, image, p) {
  const { w, h } = sourceSize(p);
  const e = {};
  for (const k of ["left", "right", "top", "bottom"]) e[k] = Math.floor(int(p[k], 0, 0, 1024) / 8) * 8;
  if (!e.left && !e.right && !e.top && !e.bottom) throw fail("Choose at least one side to extend");
  const padded = g.add("ImagePadForOutpaint", { image, ...e, feathering: int(p.feather, 48, 0, 256) }, "Extend canvas");
  return { image: padded, mask: out(padded, 1), width: w + e.left + e.right, height: h + e.top + e.bottom };
}
// Pre-fill the new area from the image edges (comfyui-inpaint-nodes); Navier-Stokes gave the
// cleanest seams in Anima Studio's live tests. Returns null when no fill is used.
export function edgeFill(g, image, mask, p) {
  const fill = p.fill || "navier-stokes";
  if (fill === "none") return null;
  if (!g.has("INPAINT_MaskedFill")) {
    g.note("Edge pre-fill skipped (install comfyui-inpaint-nodes for smoother outpaint seams)");
    return null;
  }
  return g.add("INPAINT_MaskedFill", { image, mask, fill: fill === "telea" ? "telea" : "navier-stokes", falloff: 0 }, "Pre-fill new area");
}

// Control map preprocessors, first usable alternative wins. Native ComfyUI nodes come first
// where they exist (Canny; Depth Anything 3 once its model is installed, as in the official
// Anima depth template); comfyui_controlnet_aux covers the rest. An entry may be a chain of
// nodes (`build`) and may need a model file (`ready`).
const DA3_MODELS = (info) => options(info, "LoadDA3Model", "model_name");
const PREPROCESSORS = {
  canny: [{ node: "Canny", native: true, inputs: (p) => ({ low_threshold: clamp(p.cannyLow, 0.15, 0.01, 0.99), high_threshold: clamp(p.cannyHigh, 0.4, 0.01, 0.99) }) }],
  lineart: [
    { node: "LineArtPreprocessor", inputs: () => ({ coarse: "disable" }) },
    { node: "AnimeLineArtPreprocessor" },
    { node: "Canny", native: true, inputs: () => ({ low_threshold: 0.15, high_threshold: 0.4 }) },
  ],
  scribble: [{ node: "FakeScribblePreprocessor", inputs: () => ({ safe: "enable" }) }, { node: "PiDiNetPreprocessor", inputs: () => ({ safe: "enable" }) }, { node: "HEDPreprocessor", inputs: () => ({ safe: "enable" }) }],
  hed: [{ node: "HEDPreprocessor", inputs: () => ({ safe: "enable" }) }, { node: "PiDiNetPreprocessor", inputs: () => ({ safe: "enable" }) }],
  depth: [
    {
      node: "DA3Render",
      nodes: ["LoadDA3Model", "DA3Inference", "DA3Render"],
      native: true,
      ready: (info) => DA3_MODELS(info).length > 0,
      build(g, image) {
        const name = DA3_MODELS(g.info).find((n) => /mono/i.test(n)) || DA3_MODELS(g.info)[0];
        const model = g.add("LoadDA3Model", { model_name: name, weight_dtype: "default" }, "Depth Anything 3");
        const geo = g.add("DA3Inference", { da3_model: model, image, resolution: 504, resize_method: "upper_bound_resize", mode: "mono" }, "Estimate depth");
        return g.add("DA3Render", { da3_geometry: geo, output: "depth", "output.normalization": "v2_style", "output.apply_sky_clip": false }, "Make depth map");
      },
    },
    { node: "DepthAnythingV2Preprocessor" },
  ],
  pose: [
    { node: "DWPreprocessor", inputs: () => ({ detect_hand: "enable", detect_body: "enable", detect_face: "enable" }) },
    { node: "OpenposePreprocessor", inputs: () => ({ detect_hand: "enable", detect_body: "enable", detect_face: "enable" }) },
  ],
  mlsd: [{ node: "M-LSDPreprocessor" }],
  // Grayscale tone map (sd-webui-controlnet "recolor / luminance"): composition and lighting.
  gray: [{ node: "ImageLuminanceDetector", inputs: () => ({ gamma_correction: 1 }) }, { node: "ImageIntensityDetector", inputs: () => ({ gamma_correction: 1 }) }],
};
const usable = (info, x) => (x.nodes || [x.node]).every((n) => info?.[n]) && (!x.ready || x.ready(info));
export const preprocessorFor = (info, kind) => (PREPROCESSORS[kind] || []).find((x) => usable(info, x));
// Node names to suggest when nothing usable is installed (the custom-pack alternatives).
export const preprocessorNames = (kind) => (PREPROCESSORS[kind] || []).filter((x) => !x.native).map((x) => x.node).concat((PREPROCESSORS[kind] || []).filter((x) => x.native && !x.ready).map((x) => x.node));
export const allPreprocessorNames = () => [...new Set(Object.values(PREPROCESSORS).flatMap((list) => list.flatMap((x) => x.nodes || [x.node])))];

export function controlMap(g, kind, image, p, { width, height, invert = false }) {
  let map = image;
  if (!p.isMap) {
    const pre = preprocessorFor(g.info, kind);
    if (!pre)
      throw fail(`Making a ${kind} map needs ${PACKS.aux.name} (or upload a ready-made map and tick "Image is already a map")`, {
        missing: { nodes: [{ type: preprocessorNames(kind)[0], pack: PACKS.aux }] },
      });
    const resolution = Math.min(2048, round(Math.max(width, height), 64));
    map = pre.build ? pre.build(g, image, p) : g.add(pre.node, { image, resolution, ...(pre.inputs ? pre.inputs(p) : {}) }, `Make ${kind} map`);
  }
  // `invert` describes generated maps (white lines on black → black on white); for an uploaded
  // map only the user's own "Invert map" switch applies.
  if ((p.isMap ? false : invert) !== !!p.invertMap) map = g.add("ImageInvert", { image: map }, "Invert map");
  return scaleImage(g, map, width, height, "center", "Fit map to output size");
}

export const DETECTORS = {
  face: /face_yolov8|face_yolo/i,
  hand: /hand_yolov8|hands?\.pt$|hand_yolo/i,
  eyes: /(^|\/)eyes?[._-]|eyes?_yolo/i,
  lips: /(^|\/)lips?[._-]|lips?_yolo/i,
};
// Impact Pack FaceDetailer, wired to the calling family's own model, CLIP, VAE and prompts.
export function detailer(g, image, ctx, m, p, target = "face", title) {
  needNode(g, "FaceDetailer", "Face and hand fixing");
  needNode(g, "UltralyticsDetectorProvider", "Face and hand detection");
  const detector = (ctx.inv.detectors || []).find((n) => DETECTORS[target]?.test(n));
  if (!detector)
    throw fail(`No ${target} detector is installed`, { missing: { models: [{ label: `${target} detector`, ...(target === "hand" ? MODELS.handDetector : MODELS.faceDetector) }] } });
  const provider = g.add("UltralyticsDetectorProvider", { model_name: detector }, `${target[0].toUpperCase() + target.slice(1)} detector`);
  const hand = target === "hand";
  return g.add(
    "FaceDetailer",
    {
      image,
      model: m.model,
      clip: m.clip,
      vae: m.vae,
      positive: m.positive,
      negative: m.negative,
      ...m.sample,
      guide_size: int(p.guideSize, 1024, 256, 2048),
      guide_size_for: true,
      max_size: int(p.guideSize, 1024, 256, 2048),
      denoise: clamp(p.denoise, hand ? 0.45 : 0.4, 0.05, 1),
      feather: 5,
      noise_mask: true,
      force_inpaint: true,
      bbox_threshold: clamp(p.threshold, hand ? 0.45 : 0.35, 0.05, 1),
      bbox_dilation: int(p.dilation, hand ? 8 : 6, 0, 64),
      bbox_crop_factor: clamp(p.crop, 3, 1, 10),
      drop_size: 10,
      bbox_detector: provider,
      wildcard: "",
      cycle: 1,
    },
    title || (hand ? "Hand fix" : "Face fix"),
  );
}

// ReActor (InsightFace inswapper) swap. Pixel-level, so the calling family follows it with a
// light detail pass using its own model to blend the new face into the picture's style.
export function faceSwap(g, target, face, p, ctx) {
  needNode(g, "ReActorFaceSwap", "Face swap");
  const swap = pick(ctx.inv.swapModels, null, /inswapper_128/i, "face swap model", MODELS.inswapper);
  const restorers = ctx.inv.restorers || [];
  const want = p.restore || "codeformer";
  const restore = want === "none" ? "none" : restorers.find((n) => new RegExp(want, "i").test(n)) || "none";
  const index = /^\d+(,\d+)*$/.test(String(p.targetFaces || "0")) ? String(p.targetFaces || "0") : "0";
  return g.add(
    "ReActorFaceSwap",
    {
      enabled: true,
      input_image: target,
      source_image: face,
      swap_model: swap,
      facedetection: "retinaface_resnet50",
      face_restore_model: restore,
      face_restore_visibility: clamp(p.restoreVisibility, 1, 0.1, 1),
      codeformer_weight: clamp(p.codeformerWeight, 0.6, 0, 1),
      detect_gender_input: "no",
      detect_gender_source: "no",
      input_faces_index: index,
      source_faces_index: "0",
      console_log_level: 1,
    },
    "Face swap (ReActor)",
  );
}

export function modelUpscale(g, image, p, ctx, width, height) {
  const name = pick(ctx.inv.upscalers, p.upscaler, /realesrgan_x4plus|4x/i, "upscale model", MODELS.upscaler);
  const loader = g.add("UpscaleModelLoader", { model_name: name }, "Upscale model");
  const big = g.add("ImageUpscaleWithModel", { upscale_model: loader, image }, "Upscale with model");
  return scaleImage(g, big, width, height, "disabled", "Exact output size");
}

export const REFINE_MAX = 2304;
// Upscale, then optionally re-sample lightly with the family's own model to add real detail.
// Above REFINE_MAX the refine runs tile by tile (Ultimate SD Upscale) to keep VRAM flat.
export function upscaleRefine(g, image, p, ctx, m) {
  const { w, h } = sourceSize(p);
  const scale = clamp(p.scale, 2, 1, 4);
  const width = round(w * scale), height = round(h * scale);
  if (!m) return modelUpscale(g, image, p, ctx, width, height);
  const steps = int(p.refineSteps, m.refineSteps || 10, 1, 60);
  const denoise = clamp(p.refineDenoise, 0.3, 0.05, 0.7);
  if (width > REFINE_MAX || height > REFINE_MAX) {
    if (!g.has("UltimateSDUpscale"))
      throw fail(`Refining above ${REFINE_MAX}px needs ${PACKS.usdu.name}; lower the scale or turn refine off`, { missing: { nodes: [{ type: "UltimateSDUpscale", pack: PACKS.usdu }] } });
    const name = pick(ctx.inv.upscalers, p.upscaler, /realesrgan_x4plus|4x/i, "upscale model", MODELS.upscaler);
    const loader = g.add("UpscaleModelLoader", { model_name: name }, "Upscale model");
    return g.add(
      "UltimateSDUpscale",
      {
        image, model: m.model, positive: m.positive, negative: m.negative, vae: m.vae,
        upscale_by: scale, ...m.sample, steps, denoise, upscale_model: loader,
        mode_type: "Linear", tile_width: 1024, tile_height: 1024, mask_blur: 8, tile_padding: 32,
        seam_fix_mode: "None", force_uniform_tiles: true, tiled_decode: false,
      },
      "Tiled upscale + refine",
    );
  }
  const big = modelUpscale(g, image, p, ctx, width, height);
  const latent = encode(g, big, m.vae, "Encode upscaled image");
  const s = ksampler(g, { model: m.model, positive: m.positive, negative: m.negative, latent, sample: { ...m.sample, steps }, denoise, title: "Refine detail" });
  return decode(g, s, m.vae);
}

export function removeBackground(g, image) {
  if (g.has("BiRefNetRMBG")) return g.add("BiRefNetRMBG", { image, background: "Alpha" }, "Remove background");
  if (g.has("RMBG")) return g.add("RMBG", { image, background: "Alpha" }, "Remove background");
  throw fail(`Background removal needs ${PACKS.rmbg.name}`, { missing: { nodes: [{ type: "BiRefNetRMBG", pack: PACKS.rmbg }] } });
}

export const repeatLatent = (g, latent, count) =>
  count > 1 ? g.add("RepeatLatentBatch", { samples: latent, amount: count }, "Variations") : latent;
