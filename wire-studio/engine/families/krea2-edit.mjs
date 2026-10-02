// KREA 2 — Identity Edit suite (part of the Krea 2 family; krea2.mjs passes in its own loaders).
// Built on the community Krea 2 Identity Edit LoRA and its nodes (comfyui-krea2edit v1.2.5):
//   UNETLoader → LoraLoaderModelOnly(krea2_identity_edit) → Krea2EditModelPatch → KSampler
//   Krea2EditGroundedEncode (instruction + images)  → positive
//   Krea2EditGroundedEncode (empty, same images)    → negative at CFG > 1 (the trained uncond)
// The pixel path (vae + source_image[_b] + target_latent, fit geometry) is always used.
// Reference order is fixed by training: image 1 = the scene / the image being edited, image 2 =
// the subject (person, garment, object). ref_boost acts on the last reference, ref_boost_a on the
// first. Every default and its source: docs/WORKFLOW_RESEARCH.md, Phase 3.
import { field, choice, need } from "../fields.mjs";
import { fail } from "../graph.mjs";
import { MODELS, PACKS } from "../catalog.mjs";
import * as c from "../common.mjs";
import { outpaintNeeds } from "../needs.mjs";

// Author's sampling advice: Turbo 10 steps / CFG 1; RAW 40 steps / CFG 3–4; removals RAW CFG 3, ~20.
const EDIT_TURBO = { steps: 10, cfg: 1, sampler: "euler", scheduler: "simple" };
const PRESETS = { turbo: { label: "Turbo", ...EDIT_TURBO }, regular: { label: "RAW", steps: 40, cfg: 3.5, sampler: "euler", scheduler: "simple" } };
const REMOVE_PRESETS = { turbo: { label: "Turbo", ...EDIT_TURBO }, regular: { label: "RAW (removal)", steps: 20, cfg: 3, sampler: "euler", scheduler: "simple" } };
const MAX_PIXELS = 2048 * 1024; // the LoRA's trained range ("generate at ≤ 2 MP")
const SWAP_NOTICE = "The Identity Edit LoRA is trained on SFW data only. Do not use it to make non-consensual images or deepfakes of real people.";
// The face-swap sentence documented for v1.2 (model card); the head / eye versions adapt it.
const FACE_SWAP = "A seamless face swap. Replace only the facial features of the subject in the input image with the identity from image_b.";
const HEAD_SWAP = "A seamless head swap. Replace the entire head of the subject in the input image, face and hair, with the head from image_b. Keep the body, clothing, pose and background.";
const EYES_SWAP = "Replace only the eyes of the subject in the input image with the eyes from image_b. Keep everything else unchanged.";

const words = (s) => String(s ?? "").trim();
const sentence = (s) => (words(s) ? words(s).replace(/[.!?]?$/, (m) => m || ".") : "");
const join = (...parts) => parts.map(sentence).filter(Boolean).join(" ");

export function createEditTasks(kit) {
  const { fam, loaders, baseNeeds } = kit;

  // Output size from a source: same aspect, capped at ~2 MP, multiples of 16.
  const fitSize = (w, h, max = MAX_PIXELS) => {
    const k = Math.min(1, Math.sqrt(max / (w * h)));
    return { width: c.round(w * k, 16), height: c.round(h * k, 16) };
  };
  // A chosen output size (free-size tasks), kept inside the trained range.
  const chosenSize = (p) => {
    const { width, height } = c.outputSize(p);
    return fitSize(width, height);
  };

  const editNeeds = (ctx) => [
    ...baseNeeds(ctx),
    need.node(ctx, "Krea2EditModelPatch", PACKS.krea2edit, "Injects the source image"),
    need.node(ctx, "Krea2EditGroundedEncode", PACKS.krea2edit, "Lets the text encoder see the image"),
    need.model(fam(ctx).editLora, MODELS.krea2Edit, "Krea 2 Identity Edit LoRA", "The editing LoRA (loras/krea2/editor/)"),
  ];
  const faceFocusNeeds = (ctx) => [
    need.node(ctx, "BboxDetectorSEGS", PACKS.impact, "Finds the face to focus the identity on", "recommended"),
    need.node(ctx, "UltralyticsDetectorProvider", PACKS.impactSub, "Face detection", "recommended"),
    need.model((ctx.inv.detectors || []).filter((n) => c.DETECTORS.face.test(n)), MODELS.faceDetector, "face detector", "Finds the face to focus on", "recommended"),
  ];
  const maskedNeeds = (ctx) => [need.node(ctx, "DifferentialDiffusion", PACKS.core, "Soft-mask blending", "recommended")];

  // The shared Identity Edit graph. r = { a, b?, instruction, latentOf?, size?, refBoost, refBoostA?,
  // grounding, focus?, differential?, batch?, presets?, prefer? } → the decoded image.
  function identityEdit(g, p, ctx, r) {
    for (const t of ["Krea2EditModelPatch", "Krea2EditGroundedEncode"]) c.needNode(g, t, "Krea 2 Identity Edit");
    if (!fam(ctx).editLora) throw c.missing("Krea 2 Identity Edit LoRA", MODELS.krea2Edit);
    if (!words(r.instruction)) throw fail("Describe the edit first");
    const m = loaders(g, p, ctx, { presets: r.presets || PRESETS, prefer: r.prefer });
    m.model = g.add("LoraLoaderModelOnly", { model: m.model, lora_name: fam(ctx).editLora, strength_model: 1 }, "Krea 2 Identity Edit LoRA");
    if (r.differential) {
      if (g.has("DifferentialDiffusion")) m.model = g.add("DifferentialDiffusion", { model: m.model }, "Differential diffusion");
      else g.note("DifferentialDiffusion is not available: the masked area is redrawn without soft blending");
    }
    // The sampler latent (also wired to target_latent so the source is encoded before sampling).
    const latent = r.latentOf ? r.latentOf(m.vae) : g.add("EmptySD3LatentImage", { width: r.size.width, height: r.size.height, batch_size: c.int(r.batch, 1, 1, 4) }, "Output canvas");
    const two = !!r.b;
    m.model = g.add(
      "Krea2EditModelPatch",
      {
        model: m.model,
        source_latent: c.encode(g, r.a, m.vae, "Encode image 1"),
        source_latent_b: two ? c.encode(g, r.b, m.vae, "Encode image 2") : undefined,
        vae: m.vae,
        source_image: r.a,
        source_image_b: two ? r.b : undefined,
        target_latent: latent,
        fit_mode: "fit",
        ref_boost: c.clamp(p.refBoost, r.refBoost, 0, 12),
        ref_boost_a: two ? c.clamp(p.refBoostA, r.refBoostA ?? 1, 0, 12) : undefined,
        ref_boost_mask: r.focus || undefined,
      },
      two ? "Inject source images" : "Inject source image",
    );
    const grounding = c.int(p.grounding, r.grounding, 256, 2048);
    g.note(`Instruction: ${r.instruction}`);
    const positive = g.add("Krea2EditGroundedEncode", { clip: m.clip, prompt: r.instruction, image: r.a, image_b: two ? r.b : undefined, grounding_px: grounding }, "Instruction (image-grounded)");
    const negative =
      m.sample.cfg > 1.01
        ? g.add("Krea2EditGroundedEncode", { clip: m.clip, prompt: "", image: r.a, image_b: two ? r.b : undefined, grounding_px: grounding }, "Empty instruction (uncond)")
        : g.add("ConditioningZeroOut", { conditioning: positive }, "No negative (CFG 1)");
    return c.decode(g, c.ksampler(g, { model: m.model, positive, negative, latent, sample: m.sample }), m.vae);
  }

  // Tasks whose output follows image 1, with an optional locality mask (pixel-identical outside).
  function sourceEdit(g, p, ctx, r) {
    const a = c.loadImage(g, p.image, r.aTitle || "Image to edit");
    const b = r.bName ? c.loadImage(g, r.bName, r.bTitle || "Image 2") : null;
    const { w, h } = c.sourceSize(p);
    const focus = r.focus && b && p.focus !== false ? c.faceMask(g, b, ctx, { dilation: r.focus, why: "Face focus" }) : null;
    const out = identityEdit(g, p, ctx, { ...r, a, b, size: fitSize(w, h), focus });
    return p.mask ? c.pasteBack(g, a, out, c.loadMask(g, p.mask), w, h) : out;
  }

  // Masked redraw at the image's own geometry: the encoded image with a noise mask (untouched
  // pixels stay), differential diffusion, the edit patch fed with the same image, paste-back.
  function maskedEdit(g, p, ctx, { image, mask, w, h, instruction, refBoost, grounding, feathered = false }) {
    const size = fitSize(w, h);
    const scaled = c.scaleImage(g, image, size.width, size.height, "disabled", "Fit to the trained range");
    const latentOf = (vae) => g.add("SetLatentNoiseMask", { samples: c.encode(g, scaled, vae, "Encode image"), mask }, "Limit to the masked area");
    const out = identityEdit(g, p, ctx, { a: scaled, instruction, refBoost, grounding, differential: true, latentOf });
    const back = c.scaleImage(g, out, w, h, "disabled", "Back to the original size");
    return c.composite(g, image, back, feathered ? mask : c.softEdge(g, mask, w, h));
  }

  // Identity Outpaint / Reframe: pad the canvas, pre-fill the new area, then a masked edit of the
  // padded canvas (its own geometry, so no reference offset) — the original pixels stay as they are.
  function outpaintEdit(g, p, ctx, edges) {
    const pad = c.padCanvas(g, c.loadImage(g, p.image, "Image"), { ...p, ...edges });
    const filled = c.edgeFill(g, pad.image, pad.mask, p);
    const base = filled || pad.image;
    if (/sde/i.test(p.sampler || "")) g.note("Tip: euler (an ODE sampler) keeps outpainting more coherent than SDE samplers");
    return maskedEdit(g, p, ctx, {
      image: base,
      mask: pad.mask,
      w: pad.width,
      h: pad.height,
      instruction: join("Extend the picture outward into the new area, continuing the scene naturally with matching light, perspective and style", p.prompt && `The new area shows ${words(p.prompt)}`),
      refBoost: 1,
      grounding: 768,
      feathered: true,
    });
  }

  // ---------------------------------------------------------------------------------------------
  const editAdvanced = [field.seed(), field.sampling()];
  const tuning = (refBoost, grounding, { a = false, refLabel = "Reference fidelity" } = {}) => [
    field.slider("refBoost", refLabel, 0, 10, 0.1, refBoost, { advanced: true, hint: "1 = classic, 4 = strong likeness (author's recommendation); above 10 removals and replacements start failing; below 1 frees the result" }),
    ...(a ? [field.slider("refBoostA", "Scene fidelity (image 1)", 0, 10, 0.1, 1, { advanced: true, hint: "Leave at 1 unless exploring" })] : []),
    field.slider("grounding", "Grounding size", 256, 1536, 64, grounding, { advanced: true, hint: "How large the text encoder sees the image: lower follows the instruction more, higher keeps likeness (1024 for people, 512 for stubborn scene changes)" }),
  ];
  const extra = (placeholder = "Optional: anything else to change or keep") => field.prompt({ label: "Extra instruction", optional: true, placeholder });
  const locality = field.mask({ optional: true, label: "Limit to an area", hint: "Optional: paint where the change may happen; everything else stays pixel-identical" });
  const common = [field.model(), field.loras()];
  const focusToggle = field.toggle("focus", "Focus on the face", true, { hint: "Boost the identity reference on its face only (uses the face detector)" });
  const base = { evidence: "community", verified: "graph", presets: PRESETS };
  const swap = { ...base, notes: [SWAP_NOTICE] };

  return {
    edit: {
      ...base,
      notes: ["Describe a change in plain English. Turbo at CFG 1 handles most edits; for removals use Object Remove."],
      fields: [
        field.image("image", "Image to edit"),
        field.prompt({ label: "Instruction", placeholder: "e.g. make the jacket red leather, keep everything else" }),
        field.image("image2", "Second image", { optional: true, hint: "Optional: a person to place into the first image (image 1 = scene, image 2 = person)" }),
        ...tuning(4, 768, { a: true }),
        ...common,
        ...editAdvanced,
      ],
      needs: editNeeds,
      build: (g, p, ctx) => sourceEdit(g, p, ctx, { instruction: words(p.prompt), bName: p.image2, bTitle: "Second image", refBoost: 4, grounding: 768 }),
    },

    "k2-remove": {
      ...base,
      presets: REMOVE_PRESETS,
      preferVariant: "regular",
      notes: ["Removals work best on a RAW model at CFG 3, ~20 steps; Turbo at CFG 1 tends to re-render the object. A RAW model is picked automatically when one is installed."],
      fields: [field.image("image", "Image"), field.line("object", "What to remove", "e.g. the man on the left, the power lines"), locality, extra(), ...tuning(1, 512), ...common, ...editAdvanced],
      example: { object: "the lamp post" },
      needs: editNeeds,
      build(g, p, ctx) {
        if (!words(p.object)) throw fail("Say what to remove");
        return sourceEdit(g, p, ctx, { instruction: join(`Remove ${words(p.object)}`, "Fill the area naturally, as if it had never been there", p.prompt), refBoost: 1, grounding: 512, presets: REMOVE_PRESETS, prefer: "regular" });
      },
    },

    "k2-replace": {
      ...base,
      fields: [
        field.image("image", "Image"),
        field.line("object", "What to replace", "e.g. the wooden chair"),
        field.line("with", "Replace it with", "e.g. a green velvet armchair (or leave empty and add a photo)"),
        field.image("ref", "Photo of the new object", { optional: true, hint: "Optional: image 2 — the new object as it should look" }),
        locality,
        extra(),
        ...tuning(2, 768),
        ...common,
        ...editAdvanced,
      ],
      example: { object: "the chair", with: "a green velvet armchair" },
      needs: editNeeds,
      build(g, p, ctx) {
        if (!words(p.object)) throw fail("Say what to replace");
        if (!words(p.with) && !p.ref) throw fail("Say what to put there, or add a photo of the new object");
        const what = p.ref ? `the ${words(p.with) || "object"} from image_b` : words(p.with);
        return sourceEdit(g, p, ctx, { instruction: join(`Replace ${words(p.object)} with ${what}`, "Keep everything else unchanged", p.prompt), bName: p.ref, bTitle: "New object", refBoost: 2, grounding: 768 });
      },
    },

    "k2-background": {
      ...base,
      notes: ["With a background photo, the photo becomes image 1 (the scene) and your subject image 2, the trained order."],
      fields: [
        field.image("image", "Photo of the subject"),
        field.line("scene", "New background", "e.g. a rainy Tokyo street at night"),
        field.image("bg", "Background photo", { optional: true, hint: "Optional: use this picture as the new background" }),
        extra("Optional: e.g. match the lighting to the new scene"),
        ...tuning(4, 768, { a: true, refLabel: "Subject fidelity" }),
        ...common,
        ...editAdvanced,
      ],
      example: { scene: "a sunlit beach" },
      needs: editNeeds,
      build(g, p, ctx) {
        const { w, h } = c.sourceSize(p);
        if (p.bg) {
          // Scene first, subject second (training order); the output keeps the subject photo's shape.
          const scene = c.loadImage(g, p.bg, "Background photo");
          const subject = c.loadImage(g, p.image, "Photo of the subject");
          return identityEdit(g, p, ctx, { a: scene, b: subject, size: fitSize(w, h), instruction: join("Place this person in this scene, keeping their appearance, clothing and pose exactly", words(p.scene) && `The scene is ${words(p.scene)}`, p.prompt), refBoost: 4, grounding: 768 });
        }
        if (!words(p.scene)) throw fail("Describe the new background, or add a background photo");
        return sourceEdit(g, p, ctx, { instruction: join(`Change the background to ${words(p.scene)}`, "Keep the subject, their pose and clothing exactly the same", p.prompt), refBoost: 4, grounding: 768 });
      },
    },

    "k2-person": {
      ...swap,
      fields: [
        field.image("image", "Scene"),
        field.line("who", "Who to replace", "e.g. the woman on the right"),
        field.line("with", "Replace with", "e.g. an elderly man in a tweed suit (or add a photo)"),
        field.image("person", "Photo of the new person", { optional: true, hint: "Optional: image 2 — the person to put in" }),
        locality,
        extra(),
        ...tuning(4, 1024, { a: true, refLabel: "Person fidelity" }),
        ...common,
        ...editAdvanced,
      ],
      example: { who: "the man", with: "a woman in a red coat" },
      needs: editNeeds,
      build(g, p, ctx) {
        if (!words(p.who)) throw fail("Say who to replace");
        if (!words(p.with) && !p.person) throw fail("Describe the new person, or add their photo");
        const what = p.person ? "the person from image_b" : words(p.with);
        return sourceEdit(g, p, ctx, { instruction: join(`Replace ${words(p.who)} with ${what}`, "Keep the pose, framing and everything else in the scene", p.prompt), bName: p.person, bTitle: "New person", refBoost: 4, grounding: 1024 });
      },
    },

    "k2-insert": {
      ...base,
      notes: ["Image 1 is the scene, image 2 the person — the trained order. Inputs around 1 MP work best; with two people stay at or below 1.5 MP."],
      fields: [
        field.image("image", "Scene"),
        field.image("person", "Person to insert", { hint: "Image 2" }),
        field.prompt({ label: "Where and how", placeholder: "e.g. at the cafe table, holding a coffee" }),
        ...tuning(4, 768, { a: true, refLabel: "Person fidelity" }),
        ...common,
        ...editAdvanced,
      ],
      example: { person: "person.png" },
      needs: editNeeds,
      build(g, p, ctx) {
        if (!p.person) throw fail("Add the person to insert");
        return sourceEdit(g, p, ctx, { instruction: join(`Place this person ${words(p.prompt) || "naturally into the scene"}`), aTitle: "Scene", bName: p.person, bTitle: "Person to insert", refBoost: 4, grounding: 768 });
      },
    },

    "k2-face": {
      ...swap,
      fields: [field.image("image", "Target photo", { hint: "Image 1: the picture whose face is replaced" }), field.image("face", "Identity photo", { hint: "Image 2: a clear photo of the new face" }), focusToggle, locality, extra("Optional: e.g. preserve distinguishing features: …"), ...tuning(4, 1024, { refLabel: "Identity fidelity" }), ...common, ...editAdvanced],
      example: { face: "face.png" },
      needs: (ctx) => [...editNeeds(ctx), ...faceFocusNeeds(ctx)],
      build(g, p, ctx) {
        if (!p.face) throw fail("Add the identity photo");
        return sourceEdit(g, p, ctx, { instruction: join(FACE_SWAP, p.prompt), aTitle: "Target photo", bName: p.face, bTitle: "Identity photo", refBoost: 4, grounding: 1024, focus: 10 });
      },
    },

    "k2-head": {
      ...swap,
      fields: [field.image("image", "Target photo", { hint: "Image 1: the picture whose head is replaced" }), field.image("face", "Head photo", { hint: "Image 2: the head (face and hair) to use" }), focusToggle, locality, extra(), ...tuning(4, 1024, { refLabel: "Identity fidelity" }), ...common, ...editAdvanced],
      example: { face: "face.png" },
      needs: (ctx) => [...editNeeds(ctx), ...faceFocusNeeds(ctx)],
      build(g, p, ctx) {
        if (!p.face) throw fail("Add the head photo");
        // A larger dilation covers the hair as well as the face.
        return sourceEdit(g, p, ctx, { instruction: join(HEAD_SWAP, p.prompt), aTitle: "Target photo", bName: p.face, bTitle: "Head photo", refBoost: 4, grounding: 1024, focus: 64 });
      },
    },

    "k2-eyes": {
      ...swap,
      fields: [
        field.image("image", "Photo"),
        field.line("eyes", "New eyes", "e.g. bright green eyes (or add a reference photo)"),
        field.image("ref", "Eyes reference", { optional: true, hint: "Optional: image 2 — whose eyes to use" }),
        locality,
        extra(),
        ...tuning(3, 1024),
        ...common,
        ...editAdvanced,
      ],
      example: { eyes: "bright green eyes" },
      needs: editNeeds,
      build(g, p, ctx) {
        if (!words(p.eyes) && !p.ref) throw fail("Describe the new eyes, or add a reference photo");
        const instruction = p.ref ? join(EYES_SWAP, p.prompt) : join(`Change only the eyes to ${words(p.eyes)}`, "Keep the face, expression and everything else unchanged", p.prompt);
        return sourceEdit(g, p, ctx, { instruction, bName: p.ref, bTitle: "Eyes reference", refBoost: 3, grounding: 1024 });
      },
    },

    "k2-outfit": {
      ...base,
      notes: ["For layered clothes name the order (\"under\", \"over\", \"open\") — the model follows spatial words closely."],
      fields: [field.image("image", "Photo of the person"), field.line("outfit", "New outfit", "e.g. a red raincoat over a grey hoodie"), extra("Optional: e.g. keep the shoes"), ...tuning(4, 1024), ...common, ...editAdvanced],
      example: { outfit: "a red raincoat" },
      needs: editNeeds,
      build(g, p, ctx) {
        if (!words(p.outfit)) throw fail("Describe the new outfit");
        return sourceEdit(g, p, ctx, { instruction: join(`Change their outfit to ${words(p.outfit)}`, "Keep their face, hair, pose and the background", p.prompt), refBoost: 4, grounding: 1024 });
      },
    },

    "k2-tryon": {
      ...base,
      notes: ["Image 1 is the person, image 2 the garment. Name how it is worn (\"over\", \"under\", \"open\") for layers."],
      fields: [
        field.image("image", "Photo of the person"),
        field.image("garment", "Garment", { hint: "Image 2: a photo of the clothing item" }),
        field.line("how", "How it is worn", "Optional: e.g. open, over the white shirt"),
        extra(),
        ...tuning(3, 1024, { a: true, refLabel: "Garment fidelity" }),
        ...common,
        ...editAdvanced,
      ],
      example: { garment: "garment.png" },
      needs: editNeeds,
      build(g, p, ctx) {
        if (!p.garment) throw fail("Add the garment photo");
        return sourceEdit(g, p, ctx, { instruction: join(`Dress the person in the garment from image_b${words(p.how) ? `, worn ${words(p.how)}` : ""}`, "Keep their face, body, pose and the background", p.prompt), aTitle: "Photo of the person", bName: p.garment, bTitle: "Garment", refBoost: 3, grounding: 1024 });
      },
    },

    "k2-inpaint": {
      ...base,
      status: "experimental",
      statusNote: "The masked-latent method is Wire Studio's; the LoRA's own inpainting format is not documented",
      fields: [field.image("image", "Image"), field.mask(), field.prompt({ label: "Instruction", placeholder: "e.g. give her a wide-brimmed straw hat" }), ...tuning(2, 768), ...common, ...editAdvanced],
      needs: (ctx) => [...editNeeds(ctx), ...maskedNeeds(ctx)],
      build(g, p, ctx) {
        const image = c.loadImage(g, p.image, "Image");
        const { w, h } = c.sourceSize(p);
        return maskedEdit(g, p, ctx, { image, mask: c.loadMask(g, p.mask), w, h, instruction: join(words(p.prompt) || "Fill the masked area naturally"), refBoost: 2, grounding: 768 });
      },
    },

    "k2-outpaint": {
      ...base,
      status: "experimental",
      statusNote: "The masked-latent method is Wire Studio's; extend one dimension at a time for the most reliable results",
      fields: [field.image("image", "Image"), field.edges(), field.prompt({ optional: true, placeholder: "Optional: what the new area shows" }), field.select("fill", "Pre-fill", [choice("navier-stokes", "Smooth (recommended)"), choice("telea", "Telea"), choice("none", "None")], "navier-stokes", { advanced: true }), ...tuning(1, 768), ...common, ...editAdvanced],
      example: { left: 0, right: 384 },
      needs: (ctx) => [...editNeeds(ctx), ...maskedNeeds(ctx), ...outpaintNeeds(ctx)],
      build: (g, p, ctx) => outpaintEdit(g, p, ctx, {}),
    },

    "k2-reframe": {
      ...base,
      status: "experimental",
      statusNote: "Reframing extends the canvas with Identity Outpaint (experimental)",
      fields: [
        field.image("image", "Image"),
        field.select("aspect", "New shape", c.ASPECT_CHOICES, "16:9"),
        field.select("align", "Keep the picture at", c.ALIGN.map((a) => choice(a, a[0].toUpperCase() + a.slice(1))), "center"),
        field.prompt({ optional: true, placeholder: "Optional: what the new area shows" }),
        field.select("fill", "Pre-fill", [choice("navier-stokes", "Smooth (recommended)"), choice("telea", "Telea"), choice("none", "None")], "navier-stokes", { advanced: true }),
        ...tuning(1, 768),
        ...common,
        ...editAdvanced,
      ],
      noCompare: true,
      needs: (ctx) => [...editNeeds(ctx), ...maskedNeeds(ctx), ...outpaintNeeds(ctx)],
      build(g, p, ctx) {
        const { w, h } = c.sourceSize(p);
        const edges = c.reframeEdges(w, h, c.parseRatio(p.aspect) || 16 / 9, p.align || "center");
        if (!edges.left && !edges.right && !edges.top && !edges.bottom) throw fail(`The image is already ${p.aspect || "16:9"}`);
        return outpaintEdit(g, p, ctx, edges);
      },
    },

    "k2-variation": {
      ...base,
      status: "experimental",
      statusNote: "Composed from the documented 'below 1 frees the result' reference dial",
      fields: [
        field.image("image", "Character"),
        field.prompt({ optional: true, label: "What may change", placeholder: "Optional: e.g. different outfit and hairstyle, same face" }),
        field.slider("refBoost", "Closeness to the character", 0, 2, 0.05, 0.7, { hint: "Below 1 lets variations drift further from the reference" }),
        field.size({ fromImage: true }),
        field.slider("batch", "Variations", 1, 4, 1, 4),
        field.slider("grounding", "Grounding size", 256, 1536, 64, 768, { advanced: true }),
        ...common,
        ...editAdvanced,
      ],
      noCompare: true,
      needs: editNeeds,
      build(g, p, ctx) {
        const a = c.loadImage(g, p.image, "Character");
        return identityEdit(g, p, ctx, { a, size: chosenSize(p), batch: p.batch ?? 4, instruction: join("Create a variation of this character", p.prompt, "Keep who they are recognisable"), refBoost: 0.7, grounding: 768 });
      },
    },

    "k2-restage": {
      ...base,
      notes: ["Same person, new scene: the face, outfit and marks are kept and relit; camera angle and pose may change."],
      fields: [field.image("image", "Character"), field.prompt({ label: "New scene", placeholder: "e.g. at a night market, laughing, eating street food" }), field.size({ fromImage: true }), ...tuning(4, 1024), ...common, ...editAdvanced],
      noCompare: true,
      needs: editNeeds,
      build(g, p, ctx) {
        if (!words(p.prompt)) throw fail("Describe the new scene");
        return identityEdit(g, p, ctx, { a: c.loadImage(g, p.image, "Character"), size: chosenSize(p), instruction: join(`Create a photo of this person ${words(p.prompt)}`), refBoost: 4, grounding: 1024 });
      },
    },

    "k2-sheet": {
      ...base,
      notes: ["v1.2 can create a reference sheet from a character, and use a sheet as the reference for Restage."],
      fields: [
        field.image("image", "Character"),
        field.select("views", "Views", [choice("turnaround", "Front, side and back"), choice("expressions", "Facial expressions"), choice("full", "Turnaround + expressions")], "turnaround"),
        extra("Optional: e.g. plain grey background, labelled views"),
        field.size({ width: 1536, height: 1024 }),
        ...tuning(4, 1024),
        ...common,
        ...editAdvanced,
      ],
      noCompare: true,
      needs: editNeeds,
      build(g, p, ctx) {
        const views = { turnaround: "front view, side view and back view, full body", expressions: "a grid of facial expressions: neutral, happy, angry, surprised, sad", full: "front, side and back views, full body, plus close-ups of facial expressions" }[p.views] || "front view, side view and back view, full body";
        return identityEdit(g, p, ctx, { a: c.loadImage(g, p.image, "Character"), size: chosenSize({ ...p, width: p.width ?? 1536, height: p.height ?? 1024 }), instruction: join(`Create a character reference sheet of this character: ${views}, on a plain white background`, "Keep the same face, hair and outfit in every view", p.prompt), refBoost: 4, grounding: 1024 });
      },
    },

    "k2-scene": {
      ...base,
      notes: ["Changes the whole setting and its lighting, keeping the people. To swap only what is behind the subject use Background Swap."],
      fields: [field.image("image", "Image"), field.prompt({ label: "New scene", placeholder: "e.g. relight the scene with warm golden-hour sunlight; it is now autumn in Kyoto" }), ...tuning(2, 512), ...common, ...editAdvanced],
      needs: editNeeds,
      build(g, p, ctx) {
        if (!words(p.prompt)) throw fail("Describe the new scene");
        return sourceEdit(g, p, ctx, { instruction: join(words(p.prompt), "Keep the people, their faces, clothing and poses"), refBoost: 2, grounding: 512 });
      },
    },

    "k2-pose": {
      ...base,
      status: "experimental",
      statusNote: "Reference order (pose scene first, character second) is inferred from the documented scene-first rule",
      fields: [
        field.image("image", "Character"),
        field.image("pose", "Pose reference", { optional: true, hint: "Optional: a photo of someone in the pose (image 1)" }),
        field.prompt({ label: "Pose", optional: true, placeholder: "e.g. sitting cross-legged, looking over the shoulder" }),
        field.size({ fromImage: true }),
        ...tuning(4, 1024, { a: true, refLabel: "Character fidelity" }),
        ...common,
        ...editAdvanced,
      ],
      example: { pose: "pose.png" },
      noCompare: true,
      needs: editNeeds,
      build(g, p, ctx) {
        const character = c.loadImage(g, p.image, "Character");
        if (p.pose) {
          // The pose photo plays the scene (image 1), the character the subject (image 2).
          const pose = c.loadImage(g, p.pose, "Pose reference");
          return identityEdit(g, p, ctx, { a: pose, b: character, size: chosenSize(p), instruction: join("Make this person take exactly the pose of the person in the first image", words(p.prompt) && `Pose: ${words(p.prompt)}`, "Keep their face, hair and outfit"), refBoost: 4, refBoostA: 1, grounding: 1024 });
        }
        if (!words(p.prompt)) throw fail("Describe the pose, or add a pose reference");
        return identityEdit(g, p, ctx, { a: character, size: chosenSize(p), instruction: join(`Show this person ${words(p.prompt)}`, "Keep their face, hair and outfit"), refBoost: 4, grounding: 1024 });
      },
    },
  };
}
