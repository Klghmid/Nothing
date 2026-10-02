// Form schema helpers. Families describe each task's form with these; the browser renders
// them generically, so a family only ever shows the controls its workflow really uses.
// `when: "key"` shows a field only while that value is truthy (e.g. refine options);
// `when: { key, is: [values] }` only while that value is one of the listed ones.
// A choice may carry `feature: "<name>"`: it is offered only when the family's runtime
// features (engine/index.mjs readInventory) report that feature installed, and `status`
// (see engine/capabilities.mjs).
export const field = {
  prompt: (o = {}) => ({ type: "prompt", key: "prompt", label: o.label || "Prompt", placeholder: o.placeholder || "", optional: !!o.optional, hint: o.hint, when: o.when }),
  negative: (def) => ({ type: "text", key: "negative", label: "Negative prompt", default: def || "", advanced: true }),
  image: (key = "image", label = "Image", o = {}) => ({ type: "image", key, label, hint: o.hint, optional: !!o.optional, advanced: !!o.advanced, when: o.when }),
  mask: (o = {}) => ({ type: "mask", key: "mask", label: o.label || "Area to change", hint: o.hint || "Paint on the image in the canvas", optional: !!o.optional }),
  line: (key, label, placeholder = "", o = {}) => ({ type: "line", key, label, placeholder, ...o }),
  model: (o = {}) => ({ type: "model", key: "model", label: "Model", when: o.when }),
  loras: () => ({ type: "loras", key: "loras", label: "LoRAs" }),
  size: (o = {}) => ({ type: "size", key: "size", label: "Size", fromImage: !!o.fromImage, ...(o.width ? { width: o.width, height: o.height } : {}) }),
  edges: () => ({ type: "edges", key: "edges", label: "Extend by (px)" }),
  slider: (key, label, min, max, step, def, o = {}) => ({ type: "slider", key, label, min, max, step, default: def, ...o }),
  select: (key, label, choices, def, o = {}) => ({ type: "select", key, label, choices, default: def, ...o }),
  toggle: (key, label, def = false, o = {}) => ({ type: "toggle", key, label, default: def, ...o }),
  seed: () => ({ type: "seed", key: "seed", label: "Seed", advanced: true }),
  sampling: () => ({ type: "sampling", key: "sampling", label: "Sampling", advanced: true }),
};

export const choice = (value, label, hint) => ({ value, label, hint });

// Requirement checks for the Setup view. Each returns { ok, level, kind, label, why, help };
// model checks also return `found`: the installed files that satisfy it. Pass the matching
// file(s) — a name, a list, or { name } — so Setup can say which of your files is used.
const filesOf = (x) => (Array.isArray(x) ? x : typeof x === "string" ? [x] : x?.name ? [x.name] : []).filter((n) => typeof n === "string" && n);
export const need = {
  node: (ctx, type, pack, why, level = "required") => ({ ok: !!ctx.info?.[type], level, kind: "node", label: type, why, help: pack }),
  anyNode: (ctx, types, pack, why, level = "required") => ({ ok: types.some((t) => ctx.info?.[t]), level, kind: "node", label: types.join(" or "), types, why, help: pack }),
  model: (match, model, label, why, level = "required") => {
    const found = filesOf(match);
    return { ok: Array.isArray(match) ? found.length > 0 : !!match, level, kind: "model", label, why, help: model, found };
  },
};

// Is a field shown for these form values? (the browser applies the same rule)
export function shown(fld, v) {
  if (!fld.when) return true;
  if (typeof fld.when === "string") return !!v[fld.when];
  return (fld.when.is || []).includes(v[fld.when.key]);
}
