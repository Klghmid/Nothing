// ComfyUI's POST /prompt validation, re-implemented for tests and the mock server: node types
// exist, required inputs are present, links point at existing nodes and valid output slots of
// the right type, combo values are allowed and numbers are within range. (The real rules are in
// ComfyUI's execution.py validate_inputs and comfy_execution/validation.py.)
import { comboOptions, typeMatches, nodeInputs } from "../engine/graph.mjs";

export function validatePrompt(prompt, info, { images } = {}) {
  const errors = [];
  const add = (id, message) => errors.push({ id, class_type: prompt[id]?.class_type, message });
  for (const [id, n] of Object.entries(prompt)) {
    const spec = info[n.class_type];
    if (!spec) {
      add(id, `node type ${n.class_type} not found`);
      continue;
    }
    const { required: req, optional: opt } = nodeInputs(info, n.class_type, n.inputs || {});
    for (const [k, def] of Object.entries({ ...opt, ...req })) {
      const v = n.inputs?.[k];
      if (v === undefined) {
        if (k in req) add(id, `required input ${k} is missing`);
        continue;
      }
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && Number.isInteger(v[1])) {
        const src = prompt[v[0]];
        if (!src) add(id, `${k} links to missing node ${v[0]}`);
        else {
          const outs = info[src.class_type]?.output || [];
          if (v[1] >= outs.length) add(id, `${k} uses output ${v[1]} of ${src.class_type} (${outs.length} outputs)`);
          else if (!typeMatches(outs[v[1]], def[0])) add(id, `${k}: ${src.class_type} gives ${outs[v[1]]}, expected ${def[0]}`);
        }
        continue;
      }
      const choices = comboOptions(def);
      if (choices) {
        if (n.class_type === "LoadImage" && k === "image") {
          if (images && !images.has(v)) add(id, `image file ${v} not found`);
        } else if (!choices.includes(v)) add(id, `${k}: "${v}" not in list`);
      } else if ((def[0] === "INT" || def[0] === "FLOAT") && (typeof v !== "number" || (def[1]?.min !== undefined && v < def[1].min) || (def[1]?.max !== undefined && v > def[1].max)))
        add(id, `${k}: ${v} out of range`);
    }
    for (const k of Object.keys(n.inputs || {})) if (!(k in req) && !(k in opt)) add(id, `unknown input ${k}`);
  }
  if (!Object.values(prompt).some((n) => info[n.class_type]?.output_node || n.class_type === "SaveImage")) errors.push({ message: "prompt has no output node" });
  return errors;
}
