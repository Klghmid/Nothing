// Trims a live ComfyUI /object_info down to the node types Wire Studio can use, for
// tests/live-object-info.json (written by `npm run validate:live -- --snapshot`).
// The snapshot keeps each node's real inputs, defaults, ranges, combo choices and output
// types, so the tests check the workflows against genuine upstream node definitions.
import { NODE_PACK, CORE_NODES } from "../engine/catalog.mjs";
import { allPreprocessorNames } from "../engine/common.mjs";

export function snapshotOf(info, version) {
  const keep = new Set([...Object.keys(NODE_PACK), ...CORE_NODES, ...allPreprocessorNames()]);
  const nodes = {};
  for (const type of [...keep].sort()) {
    const n = info[type];
    if (!n) continue;
    nodes[type] = { input: n.input, output: n.output, output_name: n.output_name, python_module: n.python_module };
  }
  return { comfyui: version, captured: new Date().toISOString().slice(0, 10), nodes };
}
