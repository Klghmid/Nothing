// Validates every Wire Studio workflow against a real, running ComfyUI.
//
//   COMFY_URL=http://127.0.0.1:8188 npm run validate:live            # report only
//   COMFY_URL=… npm run validate:live -- --snapshot                   # also refresh tests/live-object-info.json
//
// Each workflow is built from the live /object_info (your node packs, your model lists) and
// sent to POST /prompt, where ComfyUI's own validator checks node types, required inputs,
// combo values, number ranges and the type of every link. A workflow that passes is removed
// from the queue at once (and interrupted if it already started), so nothing really runs.
// Input images named in the workflows (input.png, mask.png, face.png, …) must exist in
// ComfyUI's input folder; the script uploads small placeholder PNGs for them first.
//
// With --snapshot the node definitions Wire Studio uses are saved (model lists replaced by
// the test fixture names) so `npm test` checks the same real definitions without ComfyUI.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorkflow, buildUtility, readInventory, FAMILIES } from "../engine/index.mjs";
import { variantParams, utilityCases } from "../engine/variants.mjs";
import { makePNG } from "../tests/mock-comfy.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.COMFY_URL || "http://127.0.0.1:8188").replace(/\/+$/, "");
const snapshot = process.argv.includes("--snapshot");

const get = async (route) => {
  const r = await fetch(base + route);
  if (!r.ok) throw new Error(`${route} → ${r.status}`);
  return r.json();
};
const post = (route, body) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const info = await get("/object_info");
const stats = await get("/system_stats");
const version = stats.system?.comfyui_version || "?";
console.log(`ComfyUI ${version} at ${base}: ${Object.keys(info).length} node types`);

// Placeholder inputs, so LoadImage's own file check passes.
const INPUTS = ["input.png", "mask.png", "face.png", "style.png", "ref.png", "bg.png", "person.png", "garment.png", "pose.png"];
for (const name of INPUTS) {
  const form = new FormData();
  form.append("image", new Blob([makePNG(64, 64, 3)], { type: "image/png" }), name);
  form.append("overwrite", "true");
  await fetch(base + "/upload/image", { method: "POST", body: form });
}

const ctx = { info, inv: readInventory(info) };
const results = [];
async function check(label, build) {
  let prompt;
  try {
    prompt = build().prompt;
  } catch (e) {
    results.push({ label, ok: false, stage: "build", error: e.message });
    return;
  }
  const r = await post("/prompt", { prompt, client_id: "wire-studio-validate" });
  const data = await r.json().catch(() => ({}));
  if (r.ok && data.prompt_id) {
    await post("/queue", { delete: [data.prompt_id] });
    await post("/interrupt", { prompt_id: data.prompt_id });
    results.push({ label, ok: true, nodes: Object.keys(prompt).length });
  } else {
    const errs = Object.entries(data.node_errors || {}).flatMap(([id, e]) => (e.errors || []).map((x) => `${prompt[id]?._meta?.title || e.class_type} (${prompt[id]?.class_type}): ${x.message} ${x.details || ""}`.trim()));
    results.push({ label, ok: false, stage: "comfyui", error: [data.error?.message, ...errs].filter(Boolean).join(" | ") });
  }
}

for (const [familyId, fam] of Object.entries(FAMILIES))
  for (const [taskId, task] of Object.entries(fam.tasks)) {
    if (task.unavailable) continue;
    for (const v of variantParams(familyId, taskId, task)) await check(`${familyId}/${taskId}${v.label ? ` (${v.label})` : ""}`, () => buildWorkflow(familyId, taskId, v.params, ctx));
  }
for (const u of utilityCases(ctx)) await check(`utility/${u.label}`, () => buildUtility(u.kind, u.params, ctx));
await post("/queue", { clear: true });
await post("/interrupt", {});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(r.ok ? "✓" : "✗", r.label, r.ok ? `(${r.nodes} nodes)` : `— ${r.stage}: ${r.error}`);
console.log(`\n${results.length - failed.length}/${results.length} workflows accepted by ComfyUI ${version}`);
await fs.mkdir(path.join(root, "tests", "output"), { recursive: true });
await fs.writeFile(path.join(root, "tests", "output", "live-validation.json"), JSON.stringify({ comfyui: version, url: base, at: new Date().toISOString(), results }, null, 2));

if (snapshot) {
  const { snapshotOf } = await import("../tests/live-snapshot.mjs");
  const file = path.join(root, "tests", "live-object-info.json");
  await fs.writeFile(file, JSON.stringify(snapshotOf(info, version), null, 1) + "\n");
  console.log("Saved", path.relative(root, file));
}
process.exit(failed.length ? 1 : 0);
