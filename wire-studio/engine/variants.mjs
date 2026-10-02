// Example parameters for every family × task, shared by the workflow export, the tests and
// the live ComfyUI validation, so all three exercise the same graphs. A task may list its own
// `variants` ([{ label, params }]); otherwise one variant per `kind` choice, else one variant.
// Image names are the placeholders the exported files use (input.png, mask.png, …).
import { preprocessorFor } from "./common.mjs";
import { CONTROL_KINDS } from "./catalog.mjs";

export const EXAMPLE = {
  prompt: "",
  seed: 123456789,
  image: "input.png",
  mask: "mask.png",
  face: "face.png",
  imageW: 1024,
  imageH: 1024,
  width: 1024,
  height: 1024,
  left: 256,
  right: 256,
  scale: 2,
  refine: true,
};

export function variantParams(familyId, taskId, task) {
  const params = { ...EXAMPLE, prompt: task.fields?.find((f) => f.type === "prompt")?.placeholder || "", ...(task.example || {}) };
  if (task.variants) return task.variants.map((v) => ({ label: v.label, file: v.file || v.label, params: { ...params, ...v.params } }));
  const kind = task.fields?.find((f) => f.key === "kind");
  if (kind && Array.isArray(kind.choices)) return kind.choices.map((c) => ({ label: String(c.value), file: String(c.value), params: { ...params, kind: c.value } }));
  return [{ label: "", file: "", params }];
}

// Family-free tools: background removal and one control map per installed preprocessor.
export function utilityCases(ctx) {
  const cases = [{ label: "remove-bg", kind: "remove-bg", params: { image: "input.png", imageW: 1024, imageH: 1024 } }];
  for (const kind of Object.keys(CONTROL_KINDS))
    if (kind === "canny" || preprocessorFor(ctx.info, kind)) cases.push({ label: `map (${kind})`, kind: "map", params: { image: "input.png", kind, imageW: 1024, imageH: 1024 } });
  return cases;
}
