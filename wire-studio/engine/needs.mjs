// Requirement lists reused by several families (custom nodes and helper models only;
// each family lists its own diffusion models itself).
import { need } from "./fields.mjs";
import { MODELS, PACKS } from "./catalog.mjs";
import { DETECTORS, preprocessorNames } from "./common.mjs";

export const detailerNeeds = (ctx, target) => [
  need.node(ctx, "FaceDetailer", PACKS.impact, "Redraws the detected area"),
  need.node(ctx, "UltralyticsDetectorProvider", PACKS.impactSub, "Finds faces and hands"),
  need.model((ctx.inv.detectors || []).filter((n) => DETECTORS[target].test(n)), target === "hand" ? MODELS.handDetector : MODELS.faceDetector, `${target} detector`, `Finds the ${target}`),
];

export const swapNeeds = (ctx) => [
  need.node(ctx, "ReActorFaceSwap", PACKS.reactor, "Swaps the face"),
  need.model((ctx.inv.swapModels || []).filter((n) => /inswapper/i.test(n)), MODELS.inswapper, "inswapper_128.onnx", "Face swap model"),
  ...detailerNeeds(ctx, "face").map((n) => ({ ...n, level: "recommended", why: "Blends the new face in with this family's model" })),
];

export const mapNeeds = (ctx, kinds) =>
  kinds.map((kind) => need.anyNode(ctx, preprocessorNames(kind), PACKS.aux, `Makes ${kind} maps from photos (skip by uploading a ready map)`, "recommended"));

export const upscaleNeeds = (ctx) => [
  need.model(ctx.inv.upscalers || [], MODELS.upscaler, "Upscale model", "Enlarges the image"),
  need.node(ctx, "UltimateSDUpscale", PACKS.usdu, "Refine outputs above 2304 px", "recommended"),
];

export const outpaintNeeds = (ctx) => [need.node(ctx, "INPAINT_MaskedFill", PACKS.inpaint, "Pre-fills the new area for cleaner seams", "recommended")];
