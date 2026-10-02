// Every workflow against REAL node definitions: tests/live-object-info.json is a snapshot of a
// running ComfyUI with the custom node packs Wire Studio uses (refresh it with
// `COMFY_URL=… npm run validate:live -- --snapshot`). Model lists in it are the official file
// names, so the inventory reads it like a fully set up ComfyUI.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildWorkflow, buildUtility, readInventory, readiness, FAMILIES } from "../engine/index.mjs";
import { variantParams, utilityCases } from "../engine/variants.mjs";
import { validatePrompt } from "./comfy-validate.mjs";
import { objectInfo } from "./fixtures.mjs";
import { comboOptions } from "../engine/graph.mjs";

const snap = JSON.parse(fs.readFileSync(new URL("./live-object-info.json", import.meta.url), "utf8"));
const info = snap.nodes;
const ctx = { info, inv: readInventory(info) };

test(`snapshot comes from a real ComfyUI (${snap.comfyui}, ${snap.captured})`, () => {
  assert.ok(Object.keys(info).length > 40);
  assert.ok(info.KSampler.input.required.sampler_name, "core nodes present");
});

for (const [familyId, fam] of Object.entries(FAMILIES))
  for (const [taskId, task] of Object.entries(fam.tasks)) {
    if (task.unavailable) continue;
    for (const v of variantParams(familyId, taskId, task))
      test(`live definitions: ${familyId}/${taskId}${v.label ? ` (${v.label})` : ""} validates`, () => {
        const { prompt } = buildWorkflow(familyId, taskId, v.params, ctx);
        assert.deepEqual(validatePrompt(prompt, info), []);
      });
  }
for (const u of utilityCases(ctx))
  test(`live definitions: utility ${u.label} validates`, () => {
    const { prompt } = buildUtility(u.kind, u.params, ctx);
    assert.deepEqual(validatePrompt(prompt, info), []);
  });

test("readiness against the real definitions: nothing required is missing", () => {
  const r = readiness(ctx);
  for (const [f, tasks] of Object.entries(r))
    for (const [t, v] of Object.entries(tasks)) if (v.state === "missing") assert.fail(`${f}/${t}: ${JSON.stringify(v.items.filter((i) => !i.ok && i.level === "required").map((i) => i.label))}`);
});

// The hand-written fixture (used by the mock ComfyUI and the unit tests) must not drift from
// the real nodes: same input names, same required/optional split, same non-file combo choices.
const FILE_INPUTS = new Set(["ckpt_name", "unet_name", "lora_name", "clip_name", "vae_name", "name", "control_net_name", "model_name", "image", "swap_model", "face_restore_model", "ipadapter_file", "instantid_file", "bg_removal_name", "pulid_file"]);
test("test fixture matches the real node definitions", () => {
  const fixture = objectInfo();
  const drift = [];
  for (const [type, spec] of Object.entries(fixture)) {
    const real = info[type];
    if (!real) continue;
    for (const part of ["required", "optional"]) {
      for (const [k, def] of Object.entries(spec.input[part] || {})) {
        const other = part === "required" ? "optional" : "required";
        if (!(k in (real.input[part] || {}))) {
          drift.push(`${type}.${k}: fixture ${part}, real ${k in (real.input[other] || {}) ? other : "absent"}`);
          continue;
        }
        const a = comboOptions(def), b = comboOptions(real.input[part][k]);
        const invented = a && b && !FILE_INPUTS.has(k) ? a.filter((x) => !b.includes(x)) : [];
        if (invented.length) drift.push(`${type}.${k}: fixture offers ${JSON.stringify(invented)}, real choices ${JSON.stringify(b)}`);
        if (!a && !b && def[0] !== real.input[part][k][0]) drift.push(`${type}.${k}: type ${def[0]} vs real ${real.input[part][k][0]}`);
      }
      for (const k of Object.keys(real.input[part] || {})) if (!(k in (spec.input.required || {})) && !(k in (spec.input.optional || {}))) drift.push(`${type}.${k}: missing from fixture (${part})`);
    }
    if (JSON.stringify(spec.output) !== JSON.stringify((real.output || []).slice(0, spec.output.length))) drift.push(`${type} outputs ${JSON.stringify(spec.output)} vs real ${JSON.stringify(real.output)}`);
  }
  assert.deepEqual(drift, []);
});
