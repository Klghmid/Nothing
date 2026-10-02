// Background Replace and Reframe for every family. One family-free orchestration (subject mask,
// mask expansion / feathering, compositing, reframe geometry) that hands masks and padded canvases
// to the family's OWN inpaint and outpaint graphs — no family's nodes or models are shared, and
// assertFamily still checks every graph. Research: docs/WORKFLOW_RESEARCH.md, Phases 7–8.
import { field, choice, need } from "./fields.mjs";
import { fail, out, options } from "./graph.mjs";
import { MODELS, PACKS } from "./catalog.mjs";
import * as c from "./common.mjs";

// Subject mask (subject = 1). Native BiRefNet first, as the Comfy-Org template
// utility_birefnet_remove_background (LoadBackgroundRemovalModel → RemoveBackground, a foreground
// mask), when its model is installed; else ComfyUI-RMBG's BiRefNet / RMBG (MASK output).
export const bgRemovalModels = (info) => options(info, "LoadBackgroundRemovalModel", "bg_removal_name");
const nativeReady = (info) => !!info?.RemoveBackground && bgRemovalModels(info).length > 0;
export const subjectReady = (info) => nativeReady(info) || !!(info?.BiRefNetRMBG || info?.RMBG);

export function subjectMask(g, image) {
  if (nativeReady(g.info)) {
    const names = bgRemovalModels(g.info);
    const model = g.add("LoadBackgroundRemovalModel", { bg_removal_name: names.find((n) => /birefnet/i.test(n)) || names[0] }, "BiRefNet");
    return g.add("RemoveBackground", { bg_removal_model: model, image }, "Find the subject");
  }
  if (g.has("BiRefNetRMBG")) return out(g.add("BiRefNetRMBG", { image, background: "Alpha" }, "Find the subject"), 1);
  if (g.has("RMBG")) return out(g.add("RMBG", { image, background: "Alpha" }, "Find the subject"), 1);
  throw fail("Finding the subject needs the BiRefNet model (models/background_removal/) or ComfyUI-RMBG", {
    missing: { models: [{ label: "BiRefNet background removal", ...MODELS.birefnet }], nodes: [{ type: "BiRefNetRMBG", pack: PACKS.rmbg }] },
  });
}
// Transparent cut-out (Remove background): the official template's InvertMask → JoinImageWithAlpha.
export function cutOut(g, image) {
  if (nativeReady(g.info)) return g.add("JoinImageWithAlpha", { image, alpha: g.add("InvertMask", { mask: subjectMask(g, image) }, "Background") }, "Cut out");
  return c.removeBackground(g, image);
}
export function subjectNeeds(ctx) {
  // With the native node but no model, ask for the official model file; otherwise for RMBG.
  if (ctx.info?.RemoveBackground && !subjectReady(ctx.info)) return [need.model(bgRemovalModels(ctx.info), MODELS.birefnet, "BiRefNet background removal model", "Finds the subject (models/background_removal/)")];
  return [{ ...need.anyNode(ctx, ["RemoveBackground", "BiRefNetRMBG", "RMBG"], PACKS.rmbg, "Finds the subject"), ok: subjectReady(ctx.info) }];
}

// Soft mask edge of `px` pixels (ImageBlur allows a radius up to 31).
function feather(g, mask, px) {
  const r = c.int(px, 6, 0, 31);
  if (!r) return mask;
  const img = g.add("MaskToImage", { mask }, "Feather");
  return g.add("ImageToMask", { image: g.add("ImageBlur", { image: img, blur_radius: r, sigma: Math.min(10, Math.max(0.5, r / 2)) }, "Feather blur"), channel: "red" }, "Feathered mask");
}
const grow = (g, mask, px, title) => (px ? g.add("GrowMask", { mask, expand: px, tapered_corners: true }, title) : mask);

const BG_MODES = [
  { ...choice("prompt", "Describe a new background"), status: "experimental" },
  { ...choice("image", "Use a background photo"), status: "experimental" },
  { ...choice("blur", "Blur the background"), status: "experimental" },
];
const isMode = (...modes) => ({ key: "bgMode", is: modes });

// `redraw(g, p, ctx, image, mask, denoise)` is the family's own masked redraw (its inpaint method,
// returning the redrawn image before paste-back); `outpaint` is the family's Outpaint task.
export function sceneTasks({ redraw, outpaint, baseNeeds, common = [], advanced = [], inpaintNeeds = () => [], label }) {
  const tasks = {};
  if (outpaint && !outpaint.unavailable) {
    const own = (outpaint.fields || []).filter((f) => !["image", "edges"].includes(f.key));
    const guided = (own.find((f) => f.key === "guide")?.choices || []).filter((ch) => ch.value !== "none");
    tasks.reframe = {
      status: outpaint.status || "ready",
      statusNote: outpaint.statusNote,
      evidence: "composed",
      verified: "graph",
      notes: [`Extends the picture to the new shape with ${label} Outpaint; the original pixels are kept.`],
      fields: [
        field.image("image", "Image"),
        field.select("target", "New shape", [choice("aspect", "Aspect ratio"), choice("size", "Exact size")], "aspect"),
        field.select("aspect", "Aspect ratio", c.ASPECT_CHOICES, "16:9", { when: { key: "target", is: ["aspect"] } }),
        field.size({ when: { key: "target", is: ["size"] } }),
        field.select("align", "Keep the picture at", c.ALIGN.map((a) => choice(a, a[0].toUpperCase() + a.slice(1))), "center"),
        ...own,
      ],
      variants: [{ label: "", params: { target: "aspect", aspect: "16:9" } }, { label: "size", params: { target: "size", width: 1344, height: 768, align: "left" } }, ...guided.map((ch) => ({ label: String(ch.value), params: { target: "aspect", aspect: "16:9", guide: ch.value } }))],
      needs: outpaint.needs,
      build(g, p, ctx) {
        const { w, h } = c.sourceSize(p);
        const exact = p.target === "size";
        const { width, height } = c.outputSize(p);
        const ratio = exact ? width / height : c.parseRatio(p.aspect) || 16 / 9;
        const edges = c.reframeEdges(w, h, ratio, p.align || "center");
        const extended = edges.left || edges.right || edges.top || edges.bottom;
        if (!extended && !exact) throw fail(`The image is already ${p.aspect || "16:9"}`);
        // Same shape, exact size: nothing to extend, only scaling.
        if (!extended) {
          g.note("Already that shape: the picture is only resized");
          return c.scaleImage(g, c.loadImage(g, p.image, "Image"), width, height, "center", "Resize to the exact size");
        }
        const image = outpaint.build(g, { ...p, ...edges }, ctx);
        return exact ? c.scaleImage(g, image, width, height, "center", "Resize to the exact size") : image;
      },
    };
  }
  if (redraw) {
    tasks["bg-replace"] = {
      status: "experimental",
      statusNote: `Wire Studio's composition: a BiRefNet subject mask, then ${label}'s own inpaint; not yet run on a GPU`,
      evidence: "composed",
      verified: "graph",
      notes: [`Finds the subject with BiRefNet, then replaces everything else. A described background is drawn by ${label}'s inpaint method; a photo or blur is composited, then a thin band around the subject is redrawn so the edge blends.`],
      fields: [
        field.image("image", "Photo"),
        field.select("bgMode", "New background", BG_MODES, "prompt"),
        field.prompt({ placeholder: "Describe the new background", when: isMode("prompt") }),
        field.image("background", "Background photo", { when: isMode("image"), hint: "Scaled and cropped to the photo's size" }),
        field.slider("blur", "Blur strength", 1, 10, 1, 6, { when: isMode("blur") }),
        field.prompt({ label: "Scene (optional)", optional: true, placeholder: "Optional: describe the whole picture, for the edge blending", when: isMode("image", "blur") }),
        field.slider("expand", "Tighten around the subject", -16, 32, 1, 4, { hint: "Pixels taken from the subject's outline (removes halos); negative keeps more edge" }),
        field.slider("feather", "Edge softness", 0, 24, 1, 6),
        field.toggle("cleanup", "Blend the edge", true, { when: isMode("image", "blur"), hint: `A light ${label} redraw of a thin band around the subject` }),
        field.slider("cleanupStrength", "Edge blend strength", 0.1, 0.7, 0.05, 0.35, { advanced: true, when: "cleanup" }),
        field.slider("band", "Edge band width", 4, 48, 2, 12, { advanced: true, when: "cleanup" }),
        field.slider("denoise", "Redraw strength", 0.5, 1, 0.01, 1, { advanced: true, when: isMode("prompt") }),
        ...common,
        ...advanced,
      ],
      variants: [
        { label: "prompt", params: { bgMode: "prompt" } },
        { label: "image", params: { bgMode: "image", background: "bg.png" } },
        { label: "blur", params: { bgMode: "blur" } },
      ],
      noCompare: false,
      needs: (ctx) => [...baseNeeds(ctx), ...subjectNeeds(ctx), ...inpaintNeeds(ctx)],
      build(g, p, ctx) {
        const { w, h } = c.sourceSize(p);
        const src = c.loadImage(g, p.image, "Photo");
        const subject = subjectMask(g, src);
        const background = grow(g, g.add("InvertMask", { mask: subject }, "Background area"), c.int(p.expand, 4, -16, 32), "Tighten around the subject");
        const soft = feather(g, background, p.feather ?? 6);
        const mode = ["image", "blur"].includes(p.bgMode) ? p.bgMode : "prompt";
        if (mode === "prompt") {
          if (!String(p.prompt || "").trim()) throw fail("Describe the new background");
          return c.composite(g, src, redraw(g, p, ctx, src, background, c.clamp(p.denoise, 1, 0.5, 1)), soft);
        }
        let fresh;
        if (mode === "image") {
          if (!p.background) throw fail("Add the background photo");
          fresh = c.scaleImage(g, c.loadImage(g, p.background, "Background photo"), w, h, "center", "Fit background to the photo");
        } else {
          const k = c.int(p.blur, 6, 1, 10);
          fresh = g.add("ImageBlur", { image: src, blur_radius: Math.min(31, k * 3), sigma: Math.min(10, k) }, "Blurred background");
        }
        const placed = c.composite(g, src, fresh, soft);
        if (p.cleanup === false) return placed;
        // Edge band: the background mask grown minus the background mask shrunk.
        const r = c.int(p.band, 12, 4, 48) / 2;
        const band = g.add("MaskComposite", { destination: grow(g, background, r, "Band outer edge"), source: grow(g, background, -r, "Band inner edge"), x: 0, y: 0, operation: "subtract" }, "Edge band");
        const blended = redraw(g, p, ctx, placed, band, c.clamp(p.cleanupStrength, 0.35, 0.1, 0.7));
        return c.composite(g, placed, blended, feather(g, band, 4));
      },
    };
  }
  return tasks;
}

// The family's tasks with Reframe and Background Replace placed right after Outpaint.
export function withSceneTasks(tasks, kit) {
  const extra = sceneTasks({ ...kit, outpaint: tasks.outpaint });
  const outTasks = {};
  for (const [id, t] of Object.entries(tasks)) {
    outTasks[id] = t;
    if (id === "outpaint") Object.assign(outTasks, extra);
  }
  return { ...extra, ...outTasks };
}
