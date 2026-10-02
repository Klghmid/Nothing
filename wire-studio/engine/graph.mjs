// API-format graph builder. Every workflow is assembled in code, then conformed to the
// connected ComfyUI's own /object_info: unknown inputs are dropped, missing required
// widgets get the node's declared default, numbers are clamped and combo values checked.
// That keeps the workflows working across custom-node versions without hand-edited JSON.

export class BuildError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.status = 409;
    Object.assign(this, extra);
  }
}
export const fail = (message, extra) => new BuildError(message, extra);

export const isLink = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && Number.isInteger(v[1]);
export const out = (ref, index) => [ref[0], index];

const DYNAMIC = "COMFY_DYNAMICCOMBO_V3";
export function comboOptions(spec) {
  if (!Array.isArray(spec)) return null;
  if (Array.isArray(spec[0])) return spec[0];
  if (spec[0] === "COMBO" && Array.isArray(spec[1]?.options)) return spec[1].options;
  if (spec[0] === DYNAMIC && Array.isArray(spec[1]?.options)) return spec[1].options.map((o) => o.key);
  return null;
}

// A node's inputs for the given values. Dynamic combos (newer core nodes, e.g. DA3Render
// "output") add the inputs of the chosen option under "<combo>.<input>", the way ComfyUI
// expands them (comfy_api/latest/_io.py DynamicCombo); unset combos use their first option.
export function nodeInputs(info, type, values = {}) {
  const input = info?.[type]?.input || {};
  const out = { required: { ...(input.required || {}) }, optional: { ...(input.optional || {}) } };
  const queue = [...Object.entries(out.required), ...Object.entries(out.optional)];
  while (queue.length) {
    const [id, def] = queue.shift();
    if (def?.[0] !== DYNAMIC) continue;
    const opts = def[1]?.options || [];
    const chosen = opts.find((o) => o.key === (values[id] ?? opts[0]?.key));
    for (const part of ["required", "optional"])
      for (const [sub, subDef] of Object.entries(chosen?.inputs?.[part] || {})) {
        out[part][`${id}.${sub}`] = subDef;
        queue.push([`${id}.${sub}`, subDef]);
      }
  }
  return out;
}

// Link type check as ComfyUI does it (comfy_execution/validation.py validate_node_input):
// equal types, "*" on either side, a combo fed by a list output, or overlapping "A,B" unions.
export function typeMatches(received, expected) {
  if (received === undefined || expected === undefined) return true;
  if (Array.isArray(expected) || expected === "COMBO") return Array.isArray(received) || received === "COMBO" || received === "*";
  if (received === expected || received === "*" || expected === "*") return true;
  if (typeof received !== "string" || typeof expected !== "string") return false;
  const a = received.split(","), b = new Set(expected.split(","));
  return a.some((t) => b.has(t));
}

// Read the option list of one combo input (model lists, samplers…).
export function options(info, type, input) {
  const { required, optional } = nodeInputs(info, type);
  return comboOptions(required[input] || optional[input]) || [];
}

export class Graph {
  constructor({ family = "utility", info = {} } = {}) {
    this.family = family;
    this.info = info;
    this.nodes = {};
    this.count = 0;
    this.notes = [];
  }
  has(type) {
    return !!this.info[type];
  }
  add(type, inputs = {}, title) {
    const id = String(++this.count);
    this.nodes[id] = { class_type: type, inputs: { ...inputs }, _meta: { title: title || type } };
    return [id, 0];
  }
  get(ref) {
    return this.nodes[ref[0]];
  }
  note(text) {
    if (!this.notes.includes(text)) this.notes.push(text);
  }
  types() {
    return [...new Set(Object.values(this.nodes).map((n) => n.class_type))];
  }
}

// Conform and validate the graph against object_info. Throws one BuildError listing
// every problem (missing nodes are reported with the pack that provides them).
export function finalize(g, packOf = () => null) {
  const missingNodes = new Set();
  const errors = [];
  for (const [id, node] of Object.entries(g.nodes)) {
    const spec = g.info[node.class_type];
    if (!spec) {
      missingNodes.add(node.class_type);
      continue;
    }
    // Unset dynamic combos take their first option before the inputs are expanded.
    for (const [key, def] of Object.entries(nodeInputs(g.info, node.class_type).required))
      if (def?.[0] === DYNAMIC && !(key in node.inputs)) node.inputs[key] = def[1]?.options?.[0]?.key;
    const { required, optional } = nodeInputs(g.info, node.class_type, node.inputs);
    const title = node._meta?.title || node.class_type;
    for (const key of Object.keys(node.inputs)) {
      if (node.inputs[key] === undefined || node.inputs[key] === null) delete node.inputs[key];
      else if (!(key in required) && !(key in optional)) delete node.inputs[key];
    }
    for (const [key, def] of Object.entries(required)) {
      if (key in node.inputs) continue;
      const opts = comboOptions(def);
      if (def?.[1]?.default !== undefined) node.inputs[key] = def[1].default;
      else if (opts?.length) node.inputs[key] = opts[0];
      else errors.push(`${title}: input "${key}" is not connected`);
    }
    for (const [key, def] of Object.entries({ ...optional, ...required })) {
      if (!(key in node.inputs)) continue;
      const value = node.inputs[key];
      if (isLink(value)) {
        const src = g.nodes[value[0]];
        if (!src) {
          errors.push(`${title}: "${key}" points to a missing node`);
          continue;
        }
        // Wrong output slots or types are build bugs: refuse them before ComfyUI sees them.
        const outs = g.info[src.class_type]?.output;
        if (Array.isArray(outs) && outs.length) {
          const srcTitle = src._meta?.title || src.class_type;
          if (value[1] >= outs.length) errors.push(`${title}: "${key}" uses output ${value[1]} of ${srcTitle}, which has ${outs.length}`);
          else if (!typeMatches(outs[value[1]], def?.[0])) errors.push(`${title}: "${key}" expects ${def[0]} but ${srcTitle} gives ${outs[value[1]]}`);
        }
        continue;
      }
      const opts = comboOptions(def);
      if (opts) {
        // LoadImage lists the input folder, which changes on every upload.
        if (!opts.includes(value) && !["LoadImage", "LoadImageMask"].includes(node.class_type))
          errors.push(`${title}: "${value}" is not available for ${key}`);
        continue;
      }
      const cfg = def?.[1] || {};
      if (typeof value === "number" && (def[0] === "INT" || def[0] === "FLOAT")) {
        let v = value;
        if (Number.isFinite(cfg.min)) v = Math.max(cfg.min, v);
        if (Number.isFinite(cfg.max)) v = Math.min(cfg.max, v);
        node.inputs[key] = def[0] === "INT" ? Math.round(v) : v;
      }
    }
  }
  if (missingNodes.size || errors.length) {
    const nodes = [...missingNodes].map((type) => ({ type, pack: packOf(type) }));
    const parts = [];
    if (nodes.length)
      parts.push("Missing ComfyUI nodes: " + nodes.map((n) => n.type + (n.pack ? ` (install ${n.pack.name})` : "")).join(", "));
    parts.push(...errors);
    throw fail(parts.join(". "), { missing: { nodes, errors } });
  }
  return g.nodes;
}
