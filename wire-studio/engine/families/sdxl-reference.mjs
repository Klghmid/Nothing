// SDXL — Image Reference (IPAdapter), Identity Reference (InstantID) and extra ControlNets
// (multi-control). Part of the SDXL family: sdxl.mjs passes in its own loaders, prompts,
// ControlNet helpers and masked redraw, so nothing here is shared with another family.
// Research: docs/WORKFLOW_RESEARCH.md, Phases 10–12.
//   IPAdapter (cubiq/ComfyUI_IPAdapter_plus, examples/*.json): IPAdapterModelLoader +
//   CLIPVisionLoader → IPAdapterAdvanced (weight types linear / style transfer / composition),
//   IPAdapterStyleComposition, IPAdapterPreciseStyleTransfer / PreciseComposition, IPAdapterTiled;
//   attn_mask limits a reference to an area.
//   InstantID (cubiq/ComfyUI_InstantID, examples/*.json): InstantIDModelLoader +
//   InstantIDFaceAnalysis + its ControlNet → ApplyInstantID (weight 0.8; face keypoints from
//   image_kps), 30 steps CFG 4.5 ddpm / karras at 1016²; extra ControlNets after it (depth
//   example: 0.65, end 0.35); IPAdapter after it for style (example: 0.5, linear).
import { field, choice, need } from "../fields.mjs";
import { fail, out } from "../graph.mjs";
import { MODELS, PACKS } from "../catalog.mjs";
import * as c from "../common.mjs";
import { mapNeeds } from "../needs.mjs";

const EMBEDS = "V only";
const COMBINE = [choice("concat", "Concatenate (stronger)"), choice("average", "Average")];

export function createReferenceTasks(kit) {
  const { fam, loaders, prompts, applyNet, pickNet, maskedRedraw, baseNeeds, common, advanced, KINDS, SAMPLE } = kit;
  const KIND_VALUES = KINDS.map((k) => k.value);
  const sample = (g, m, latent, p, denoise, defaults = SAMPLE) => c.decode(g, c.ksampler(g, { ...m, latent, sample: c.sampling(p, defaults), denoise }), m.vae);

  // ---------- IPAdapter ----------
  // Automatic pick: PLUS ViT-H (the examples' "PLUS (high strength)"), then the ViT-H base model,
  // then the ViT-G model. Face / composition-only models only when chosen under Advanced.
  const ipaList = (ctx) => fam(ctx).ipadapters || [];
  function pickIpa(ctx, wanted) {
    const list = ipaList(ctx);
    if (wanted) {
      if (list.includes(wanted)) return wanted;
      throw c.missing(`SDXL IPAdapter "${wanted}"`, MODELS.sdxlIpaPlus);
    }
    const name = (n) => n.split(/[\\/]/).pop();
    return list.find((n) => /plus_sdxl_vit-h/i.test(name(n)) && !/face/i.test(n)) || list.find((n) => /sdxl_vit-h/i.test(name(n)) && !/face/i.test(n)) || list.find((n) => /^ip-adapter_sdxl\./i.test(name(n))) || null;
  }
  // ViT-H models need the ViT-H image encoder; ip-adapter_sdxl (ViT-G) needs bigG.
  const clipFor = (ctx, ipa) => {
    const list = fam(ctx).clipVisions || [];
    return /vit-h|plus|composition/i.test(ipa) ? list.find((n) => /vit-h|ViT-H-14/i.test(n)) : list.find((n) => /bigG|vit-g/i.test(n));
  };
  function ipadapter(g, p, ctx) {
    for (const t of ["IPAdapterModelLoader", "IPAdapterAdvanced"]) c.needNode(g, t, "Image reference (IPAdapter)");
    const file = pickIpa(ctx, p.ipadapter);
    if (!file) throw c.missing("SDXL IPAdapter model", MODELS.sdxlIpaPlus);
    const clip = clipFor(ctx, file);
    if (!clip) throw c.missing(/vit-h|plus|composition/i.test(file) ? "CLIP Vision ViT-H encoder" : "CLIP Vision bigG encoder", MODELS.clipVisionH);
    return { ipa: g.add("IPAdapterModelLoader", { ipadapter_file: file }, "IPAdapter"), clip_vision: g.add("CLIPVisionLoader", { clip_name: clip }, "CLIP Vision") };
  }
  const ipaNeeds = (ctx, level = "required") => [
    need.node(ctx, "IPAdapterAdvanced", PACKS.ipadapter, "Applies the reference", level),
    need.model(pickIpa(ctx), MODELS.sdxlIpaPlus, "SDXL IPAdapter (Plus ViT-H recommended)", "Reads the reference image", level),
    need.model((fam(ctx).clipVisions || []).filter((n) => /vit-h|ViT-H-14/i.test(n)), MODELS.clipVisionH, "CLIP Vision ViT-H", "Image encoder for the IPAdapter", level),
  ];

  // Reference modes: the weight type / node each uses (IPAdapter's own names and defaults).
  const MODES = {
    subject: { label: "Subject & look", weight_type: "linear", weight: 0.8 },
    style: { label: "Style only", weight_type: "style transfer", weight: 1 },
    composition: { label: "Composition only", weight_type: "composition", weight: 1 },
    "style-composition": { label: "Style + composition (two images)", node: "IPAdapterStyleComposition", weight: 1.2, two: true },
    "precise-style": { label: "Precise style", node: "IPAdapterPreciseStyleTransfer", weight: 1 },
    "precise-composition": { label: "Precise composition", node: "IPAdapterPreciseComposition", weight: 0.8 },
    regional: { label: "Two references, one per region", weight_type: "linear", weight: 0.7, two: true, status: "experimental", evidence: "composed" },
  };
  // Left / right (or top / bottom) halves, or the painted area and the rest.
  function regions(g, p, dims, painted) {
    if (painted) return [painted, g.add("InvertMask", { mask: painted }, "The rest")];
    const across = p.split !== "top-bottom";
    const w = across ? Math.round(dims.width / 2) : dims.width, h = across ? dims.height : Math.round(dims.height / 2);
    const half = g.add("MaskComposite", { destination: g.add("SolidMask", { value: 0, width: dims.width, height: dims.height }, "Empty mask"), source: g.add("SolidMask", { value: 1, width: w, height: h }, across ? "Left half" : "Top half"), x: 0, y: 0, operation: "add" }, "Region 1");
    return [half, g.add("InvertMask", { mask: half }, "Region 2")];
  }
  // Apply the reference(s) to m.model. `mask` (a painted area) limits where the reference acts.
  function applyReference(g, m, p, ctx, { mask = null, dims }) {
    const mode = MODES[p.mode] ? p.mode : "subject";
    const spec = MODES[mode];
    const { ipa, clip_vision } = ipadapter(g, p, ctx);
    const ref1 = c.loadImage(g, p.ref1, spec.two ? "Reference 1" : "Reference image");
    if (spec.two && !p.ref2) throw fail(`${spec.label} needs a second reference image`);
    const ref2 = p.ref2 ? c.loadImage(g, p.ref2, "Reference 2") : null;
    const weight = c.clamp(p.weight, spec.weight, -1, 3);
    const start_at = c.clamp(p.start, 0, 0, 0.95);
    const end_at = Math.max(start_at + 0.05, c.clamp(p.end, 1, 0.05, 1));
    const shared = { ipadapter: ipa, clip_vision, start_at, end_at, embeds_scaling: EMBEDS, combine_embeds: p.combine === "average" ? "average" : "concat", ...(mask ? { attn_mask: mask } : {}) };
    if (mode === "style-composition") {
      c.needNode(g, "IPAdapterStyleComposition", "Style + composition");
      m.model = g.add("IPAdapterStyleComposition", { ...shared, model: m.model, image_style: ref1, image_composition: ref2, weight_style: weight, weight_composition: c.clamp(p.weight2, 1, -1, 3), expand_style: false, combine_embeds: "average" }, "Style + composition reference");
      return;
    }
    if (mode === "precise-style") {
      m.model = g.add("IPAdapterPreciseStyleTransfer", { ...shared, model: m.model, image: ref2 ? g.add("ImageBatch", { image1: ref1, image2: ref2 }, "References") : ref1, weight, style_boost: c.clamp(p.styleBoost, 1, -5, 5) }, "Precise style reference");
      return;
    }
    if (mode === "precise-composition") {
      m.model = g.add("IPAdapterPreciseComposition", { ...shared, model: m.model, image: ref2 ? g.add("ImageBatch", { image1: ref1, image2: ref2 }, "References") : ref1, weight, composition_boost: c.clamp(p.compBoost, 0.35, -5, 5), embeds_scaling: "K+mean(V) w/ C penalty" }, "Precise composition reference");
      return;
    }
    if (mode === "regional") {
      const [a, b] = regions(g, p, dims, mask);
      for (const [img, area, n] of [[ref1, a, 1], [ref2, b, 2]])
        m.model = g.add("IPAdapterAdvanced", { ...shared, model: m.model, image: img, weight, weight_type: spec.weight_type, attn_mask: area }, `Reference ${n} (region ${n})`);
      return;
    }
    const image = ref2 ? g.add("ImageBatch", { image1: ref1, image2: ref2 }, "References") : ref1;
    // Tiled: the whole reference in square tiles (for wide or tall references).
    if (p.tiled) {
      c.needNode(g, "IPAdapterTiled", "Tiled reference");
      m.model = out(g.add("IPAdapterTiled", { ...shared, model: m.model, image, weight, weight_type: spec.weight_type, sharpening: 0 }, `${spec.label} reference (tiled)`), 0);
    } else m.model = g.add("IPAdapterAdvanced", { ...shared, model: m.model, image, weight, weight_type: spec.weight_type }, `${spec.label} reference`);
  }

  // ---------- extra ControlNets (multi-control) ----------
  // Slots c<i>…: each with its own type, image (or ready map), strength and start / end; one
  // ControlNet file is loaded once and shared by every slot that uses it.
  const isOn = (i) => ({ key: `c${i}Kind`, is: KIND_VALUES });
  // Kinds in `ready` follow a documented example (InstantID's depth); the rest are Wire Studio's
  // combinations and marked experimental.
  const controlFields = (slots, { strength = 0.6, end = 0.8, ready = [] } = {}) =>
    slots.flatMap((i, n) => [
      field.select(`c${i}Kind`, n ? `Another control` : "Add a control", [choice("none", "None"), ...KINDS.map((k) => ({ ...k, status: ready.includes(k.value) ? "ready" : "experimental", ...(ready.includes(k.value) ? {} : { evidence: "composed" }) }))], "none", n ? { when: isOn(slots[n - 1]) } : {}),
      field.image(`c${i}Image`, `Control ${i} image`, { when: isOn(i), hint: "A picture to take the structure from, or a ready map" }),
      field.toggle(`c${i}IsMap`, `Control ${i} image is already a map`, false, { when: isOn(i) }),
      field.slider(`c${i}Strength`, `Control ${i} strength`, 0.1, 1.5, 0.05, strength, { when: isOn(i) }),
      field.slider(`c${i}Start`, `Control ${i} from`, 0, 0.9, 0.05, 0, { advanced: true, when: isOn(i) }),
      field.slider(`c${i}End`, `Control ${i} until`, 0.1, 1, 0.05, end, { advanced: true, when: isOn(i) }),
    ]);
  function applyControls(g, m, p, ctx, dims, slots, { strength = 0.6, end = 0.8 } = {}) {
    for (const i of slots) {
      const kind = p[`c${i}Kind`];
      if (!KIND_VALUES.includes(kind)) continue;
      const net = pickNet(fam(ctx).controlnets, kind, p[`c${i}Net`]);
      if (!net) throw c.missing(`SDXL ${kind} or Union ControlNet (control ${i})`, MODELS.sdxlUnion);
      if (!p[`c${i}Image`]) throw fail(`Add the image for control ${i}`);
      const map = c.controlMap(g, kind, c.loadImage(g, p[`c${i}Image`], `Control ${i} image`), { ...p, isMap: !!p[`c${i}IsMap`], invertMap: false }, dims);
      const start = c.clamp(p[`c${i}Start`], 0, 0, 0.9);
      Object.assign(m, applyNet(g, m, net, kind, map, c.clamp(p[`c${i}Strength`], strength, 0, 2), Math.max(start + 0.05, c.clamp(p[`c${i}End`], end, 0.1, 1)), start));
    }
  }
  const controlNeeds = (ctx) => [need.model(fam(ctx).controlnets, MODELS.sdxlUnion, "SDXL ControlNet (Union ProMax recommended)", "Extra controls", "recommended"), ...mapNeeds(ctx, ["lineart", "depth", "pose", "scribble"])];

  // Where a generation starts: an empty canvas, a source image (img2img), or a painted area of it.
  const BASES = [{ ...choice("prompt", "A prompt"), status: "ready" }, { ...choice("image", "An image (redraw it)"), status: "experimental", evidence: "composed" }, { ...choice("inpaint", "A painted area of an image"), status: "experimental", evidence: "composed" }];
  const fromImage = { key: "base", is: ["image", "inpaint"] };
  function canvas(g, p) {
    const base = ["image", "inpaint"].includes(p.base) ? p.base : "prompt";
    if (base === "prompt") {
      const { width, height, batch } = c.outputSize(p);
      return { base, dims: { width, height }, latent: (m) => g.add("EmptyLatentImage", { width, height, batch_size: batch }, "Empty canvas") };
    }
    const src = c.loadImage(g, p.image, "Source image");
    const { w, h } = c.sourceSize(p);
    const mask = p.mask ? c.loadMask(g, p.mask) : null;
    if (base === "inpaint" && !mask) throw fail("Paint the area to change first");
    return { base, src, mask, w, h, dims: { width: w, height: h }, latent: (m) => c.encode(g, src, m.vae) };
  }
  // Sample on the canvas; an inpaint uses SDXL's own masked redraw and is pasted back.
  function finishOn(g, m, p, ctx, cv, defaults) {
    if (cv.base === "inpaint") return c.composite(g, cv.src, maskedRedraw(g, m, p, ctx, cv.src, cv.mask, cv.dims, c.clamp(p.denoise, 1, 0.1, 1)), c.softEdge(g, cv.mask, cv.w, cv.h));
    return sample(g, m, cv.latent(m), p, cv.base === "image" ? c.clamp(p.denoise, 0.6, 0.05, 1) : 1, defaults);
  }
  const baseFields = [
    field.mask({ label: "Area", optional: true, when: fromImage, hint: "Inpaint: the area to redraw. Redraw: optional, limits the reference to it" }),
    field.slider("denoise", "Change strength", 0.1, 1, 0.01, 0.6, { when: fromImage }),
  ];

  const IDENTITY = { steps: 30, cfg: 4.5, sampler: "ddpm", scheduler: "karras" };
  // The author's example uses "linear" at 0.5; style / composition weight types are combinations.
  const STYLE_ON_ID = [choice("none", "None"), { ...choice("linear", "General look"), status: "ready" }, { ...choice("style transfer", "Style only"), status: "experimental", evidence: "composed" }, { ...choice("composition", "Composition only"), status: "experimental", evidence: "composed" }];
  const idNeeds = (ctx) => [
    need.node(ctx, "ApplyInstantIDAdvanced", PACKS.instantid, "Applies the identity"),
    need.model(fam(ctx).instantid, MODELS.instantid, "InstantID model (ip-adapter.bin)", "Reads the face"),
    need.model(fam(ctx).instantidNets, MODELS.instantidNet, "InstantID ControlNet", "Places the face (models/controlnet/instantid/)"),
  ];

  const tasks = {
    // ---------- Phase 10: Image Reference (IPAdapter) ----------
    reference: {
      evidence: "community",
      verified: "graph",
      notes: [
        "Uses a picture as a reference through IPAdapter (cubiq/ComfyUI_IPAdapter_plus), as in its example workflows. Starting from an image, inpainting and extra controls are Wire Studio's combinations (experimental).",
      ],
      fields: [
        field.select("mode", "Take from the reference", Object.entries(MODES).map(([k, v]) => ({ ...choice(k, v.label), status: v.status || "ready", ...(v.evidence ? { evidence: v.evidence } : {}) })), "subject"),
        field.select("base", "Start from", BASES, "prompt"),
        field.image("image", "Source image", { when: fromImage }),
        field.image("ref1", "Reference image"),
        field.image("ref2", "Second reference", { optional: true, hint: "Style + composition: the composition image. Regions: the reference for region 2. Otherwise: blended with the first" }),
        field.select("split", "Regions", [choice("left-right", "Left / right"), choice("top-bottom", "Top / bottom")], "left-right", { when: { key: "mode", is: ["regional"] }, hint: "Or paint an area when starting from an image" }),
        field.prompt({ placeholder: "Describe the picture" }),
        field.slider("weight", "Reference strength", 0, 2, 0.05, 0.8, { hint: "IPAdapter advice: about 0.8; style modes up to 1–1.2" }),
        field.slider("weight2", "Composition strength", 0, 2, 0.05, 1, { when: { key: "mode", is: ["style-composition"] } }),
        ...baseFields,
        field.size({ when: { key: "base", is: ["prompt"] } }),
        field.slider("batch", "Images", 1, 4, 1, 1, { when: { key: "base", is: ["prompt"] } }),
        ...controlFields([1, 2]),
        field.slider("styleBoost", "Style boost", -2, 3, 0.05, 1, { advanced: true, when: { key: "mode", is: ["precise-style"] } }),
        field.slider("compBoost", "Composition boost", -2, 3, 0.05, 0.35, { advanced: true, when: { key: "mode", is: ["precise-composition"] } }),
        field.toggle("tiled", "Use the whole reference (tiled)", false, { advanced: true, when: { key: "mode", is: ["subject", "style", "composition"] }, hint: "For wide or tall references" }),
        field.select("combine", "Two references", COMBINE, "concat", { advanced: true }),
        field.slider("start", "Reference from", 0, 0.9, 0.05, 0, { advanced: true }),
        field.slider("end", "Reference until", 0.1, 1, 0.05, 1, { advanced: true }),
        field.select("ipadapter", "IPAdapter model", "ipadapters", "", { advanced: true }),
        ...common,
        ...advanced,
      ],
      example: { ref1: "ref.png" },
      variants: [
        ...Object.keys(MODES).map((mode) => ({ label: mode, params: { mode, ...(MODES[mode].two ? { ref2: "style.png" } : {}) } })),
        { label: "subject-tiled", params: { mode: "subject", tiled: true } },
        { label: "style-img2img", params: { mode: "style", base: "image" } },
        { label: "subject-inpaint", params: { mode: "subject", base: "inpaint", mask: "mask.png" } },
        { label: "style-controlnet", params: { mode: "style", c1Kind: "depth", c1Image: "input.png" } },
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...ipaNeeds(ctx), ...controlNeeds(ctx)],
      build(g, p, ctx) {
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const cv = canvas(g, p);
        applyReference(g, m, p, ctx, { mask: cv.mask, dims: cv.dims });
        applyControls(g, m, p, ctx, cv.dims, [1, 2]);
        return finishOn(g, m, p, ctx, cv);
      },
    },

    // ---------- Phase 11: Identity Reference (InstantID) ----------
    identity: {
      evidence: "community",
      verified: "graph",
      presets: { regular: { label: "InstantID", ...IDENTITY }, turbo: { label: "Turbo", steps: 8, cfg: 1.5, sampler: "euler", scheduler: "sgm_uniform" } },
      notes: [
        "InstantID (cubiq/ComfyUI_InstantID): new pictures of the person in a face photo. Needs insightface and the antelopev2 face model in models/insightface/models/antelopev2 — Wire Studio cannot check that folder.",
        "Author's advice: CFG 4–5 and a size slightly off 1024 × 1024 (1016 × 1016 avoids watermarks).",
      ],
      fields: [
        field.select("base", "Start from", BASES.slice(0, 2), "prompt"),
        field.image("image", "Source image", { when: { key: "base", is: ["image"] } }),
        field.image("face", "Face photo", { hint: "One clear face" }),
        field.prompt({ placeholder: "Describe the new picture of this person" }),
        field.size({ width: 1016, height: 1016, when: { key: "base", is: ["prompt"] } }),
        field.slider("weight", "Identity strength", 0, 1.5, 0.05, 0.8),
        field.image("pose", "Head pose from", { optional: true, hint: "Optional: a photo whose face position and angle to copy" }),
        field.select("styleMode", "Style reference", STYLE_ON_ID, "none", { hint: "Optional: an IPAdapter reference on top (needs IPAdapter)" }),
        field.image("styleImage", "Style image", { when: { key: "styleMode", is: ["linear", "style transfer", "composition"] } }),
        field.slider("styleWeight", "Style strength", 0, 1.5, 0.05, 0.5, { when: { key: "styleMode", is: ["linear", "style transfer", "composition"] } }),
        field.slider("denoise", "Change strength", 0.1, 1, 0.01, 0.6, { when: { key: "base", is: ["image"] } }),
        ...controlFields([1, 2], { strength: 0.65, end: 0.35, ready: ["depth"] }),
        field.slider("cnStrength", "Face placement strength", 0, 1.5, 0.05, 0.8, { advanced: true, hint: "InstantID's own ControlNet (keypoints)" }),
        field.slider("noise", "Noise injection", 0, 1, 0.05, 0.35, { advanced: true, hint: "Reduces the 'burned' look (author's default 0.35)" }),
        field.slider("start", "Identity from", 0, 0.9, 0.05, 0, { advanced: true }),
        field.slider("end", "Identity until", 0.1, 1, 0.05, 1, { advanced: true }),
        field.select("provider", "Face analysis on", [choice("CPU", "CPU"), choice("CUDA", "CUDA (NVIDIA)"), choice("ROCM", "ROCm (AMD)"), choice("CoreML", "CoreML (Mac)")], "CPU", { advanced: true }),
        ...common,
        ...advanced,
      ],
      example: { face: "face.png", width: 1016, height: 1016 },
      variants: [
        { label: "", params: {} },
        { label: "pose", params: { pose: "pose.png" } },
        { label: "depth", params: { c1Kind: "depth", c1Image: "input.png" } },
        { label: "style", params: { styleMode: "style transfer", styleImage: "style.png" } },
        { label: "img2img", params: { base: "image" } },
        { label: "multi-control", params: { c1Kind: "depth", c1Image: "input.png", c2Kind: "canny", c2Image: "input.png" } },
      ],
      needs: (ctx) => [...baseNeeds(ctx), ...idNeeds(ctx), ...ipaNeeds(ctx, "recommended"), ...controlNeeds(ctx)],
      build(g, p, ctx) {
        for (const t of ["InstantIDModelLoader", "InstantIDFaceAnalysis", "ApplyInstantIDAdvanced"]) c.needNode(g, t, "Identity reference (InstantID)");
        const f = fam(ctx);
        if (!f.instantid?.length) throw c.missing("InstantID model", MODELS.instantid);
        if (!f.instantidNets?.length) throw c.missing("InstantID ControlNet", MODELS.instantidNet);
        const m = loaders(g, p, ctx);
        Object.assign(m, prompts(g, m, p));
        const cv = canvas(g, { ...p, base: p.base === "image" ? "image" : "prompt", mask: null });
        const start_at = c.clamp(p.start, 0, 0, 0.9);
        const weight = c.clamp(p.weight, 0.8, 0, 1.5);
        const applied = g.add(
          "ApplyInstantIDAdvanced",
          {
            instantid: g.add("InstantIDModelLoader", { instantid_file: f.instantid[0] }, "InstantID"),
            insightface: g.add("InstantIDFaceAnalysis", { provider: ["CPU", "CUDA", "ROCM", "CoreML"].includes(p.provider) ? p.provider : "CPU" }, "Face analysis (antelopev2)"),
            control_net: g.add("ControlNetLoader", { control_net_name: f.instantidNets[0] }, "InstantID ControlNet"),
            image: c.loadImage(g, p.face, "Face photo"),
            model: m.model,
            positive: m.positive,
            negative: m.negative,
            ip_weight: weight,
            cn_strength: c.clamp(p.cnStrength, weight, 0, 1.5),
            start_at,
            end_at: Math.max(start_at + 0.05, c.clamp(p.end, 1, 0.1, 1)),
            noise: c.clamp(p.noise, 0.35, 0, 1),
            combine_embeds: "average",
            ...(p.pose ? { image_kps: c.loadImage(g, p.pose, "Head pose photo") } : {}),
          },
          "Apply InstantID",
        );
        Object.assign(m, { model: out(applied, 0), positive: out(applied, 1), negative: out(applied, 2) });
        if (["linear", "style transfer", "composition"].includes(p.styleMode)) {
          if (!p.styleImage) throw fail("Add the style image");
          const { ipa, clip_vision } = ipadapter(g, p, ctx);
          m.model = g.add("IPAdapterAdvanced", { model: m.model, ipadapter: ipa, clip_vision, image: c.loadImage(g, p.styleImage, "Style image"), weight: c.clamp(p.styleWeight, 0.5, 0, 1.5), weight_type: p.styleMode, combine_embeds: "concat", start_at: 0, end_at: 1, embeds_scaling: EMBEDS }, "Style reference");
        }
        applyControls(g, m, p, ctx, cv.dims, [1, 2], { strength: 0.65, end: 0.35 });
        return finishOn(g, m, p, ctx, cv, IDENTITY);
      },
    },
  };
  // The ControlNet task reuses the control slots for its multi-control (sdxl.mjs).
  return { tasks, controlFields, applyControls };
}
