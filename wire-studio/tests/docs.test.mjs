// The models guide must stay current, and following it must give a fully detected setup.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { MODEL_LIST } from "../engine/model-list.mjs";
import { MODELS } from "../engine/catalog.mjs";
import { readInventory, readiness, suggestions } from "../engine/index.mjs";
import { render, GUIDE } from "../scripts/build-model-guide.mjs";
import { objectInfo, FILES } from "./fixtures.mjs";

const FAMILY_ID = { Anima: "anima", SDXL: "sdxl", "Z-Image": "zimage", "Krea 2": "krea2" };
const KNOWN = ["checkpoints", "diffusion_models", "loras", "text_encoders", "vae", "model_patches", "controlnet", "upscale_models", "ultralytics", "insightface", "facerestore_models"];
// Placeholder rows ("your … models") get a concrete sample name for the detection test.
const fileOf = (m, i) => (/\s/.test(m.file) ? `sample_${i}.${m.path.startsWith("ultralytics") ? "pt" : "safetensors"}` : m.file);

test("docs/MODEL-FOLDERS.md is up to date with engine/model-list.mjs (run npm run docs)", async () => {
  const text = await fs.readFile(GUIDE, "utf8");
  assert.equal(render(text), text);
});

test("every suggested file has a known folder, and Setup's suggestions come from the list", () => {
  for (const m of MODEL_LIST) {
    assert.ok(KNOWN.includes(m.path.split("/")[0]), `${m.file}: ${m.path}`);
    if (m.url) assert.match(m.url, /^https:\/\//);
  }
  for (const [key, help] of Object.entries(MODELS)) {
    const entry = MODEL_LIST.find((m) => m.key === key);
    assert.ok(entry && help.folder === entry.path && help.url === entry.url, key);
  }
  const lean = objectInfo({ ...FILES, unets: [], checkpoints: [], loras: [], patches: [], clips: [], vaes: [], controlnets: [], upscalers: [], detectors: [] });
  for (const tasks of Object.values(readiness({ info: lean, inv: readInventory(lean) })))
    for (const r of Object.values(tasks))
      for (const item of r.items || []) if (item.kind === "model") assert.ok(item.help?.file && item.help?.folder && item.help?.url, `help for ${item.label}`);
});

test("following the guide gives a fully detected setup: right family, right type, every task ready", () => {
  const rel = (m, i, top) => `${m.path.slice(top.length + 1) ? m.path.slice(top.length + 1) + "/" : ""}${fileOf(m, i)}`;
  const files = { checkpoints: [], unets: [], loras: [], clips: [], vaes: [], patches: [], controlnets: [], upscalers: [], detectors: [], inputs: ["example.png"] };
  const slot = { checkpoints: "checkpoints", diffusion_models: "unets", loras: "loras", text_encoders: "clips", vae: "vaes", model_patches: "patches", controlnet: "controlnets", upscale_models: "upscalers", ultralytics: "detectors" };
  MODEL_LIST.forEach((m, i) => {
    const top = m.path.split("/")[0];
    if (!slot[top] || m.duplicate) return;
    const name = top === "ultralytics" ? rel(m, i, "ultralytics") : rel(m, i, top);
    files[slot[top]].push(name);
    m._name = name;
  });
  const info = objectInfo(files);
  const inv = readInventory(info);
  for (const m of MODEL_LIST.filter((x) => FAMILY_ID[x.family] && x._name)) {
    const fam = inv.families[FAMILY_ID[m.family]];
    const top = m.path.split("/")[0];
    if (top === "diffusion_models" || top === "checkpoints") {
      assert.ok(fam.models.includes(m._name), `${m._name} is a ${m.family} model`);
      const type = /\/turbo\//.test(m.path + "/") ? "turbo" : "regular";
      assert.equal(fam.variants[m._name], type, `${m._name} is ${type}`);
    }
    if (top === "loras") assert.ok([...(fam.loras || []), fam.turboLora, fam.styleLora, fam.editLora, ...(fam.controlLoras || [])].includes(m._name), `${m._name} is a ${m.family} LoRA`);
    if (top === "model_patches") assert.ok(fam.patches.includes(m._name), `${m._name} is a ${m.family} patch`);
    if (top === "controlnet") assert.ok(fam.controlnets.includes(m._name), `${m._name} is an SDXL ControlNet`);
  }
  assert.ok(inv.families.krea2.controlLoras.some((n) => n.startsWith("krea2/control/")), "loras/krea2/control/ holds control LoRAs");
  assert.equal(inv.families.krea2.editLora, "krea2/editor/krea2_identity_edit_v1_2.safetensors", "loras/krea2/editor/ holds the edit LoRA");
  assert.deepEqual(inv.unsortedLoras, []);
  assert.deepEqual(inv.misplaced, []);
  const ready = readiness({ info, inv });
  for (const [family, tasks] of Object.entries(ready))
    for (const [task, r] of Object.entries(tasks)) if (r.state !== "off") assert.equal(r.state, "ready", `${family}/${task}: ${JSON.stringify(r.items.filter((x) => !x.ok).map((x) => x.label))}`);
  // Setup → Suggested models & LoRAs then shows every file placed by the guide as installed.
  for (const m of suggestions({ info, inv }, ready)) if (m.path.split("/")[0] in slot) assert.equal(m.status, "found", `${m.file} shows as installed`);
});

test("docs/CAPABILITY_MATRIX.md is generated from the engine (run npm run docs)", async () => {
  const { render, MATRIX_DOC } = await import("../scripts/build-capability-matrix.mjs");
  const text = await fs.readFile(MATRIX_DOC, "utf8");
  assert.equal(render(text), text);
});

test("every offered task declares its status, evidence and verification level", async () => {
  const { FAMILIES } = await import("../engine/index.mjs");
  const { capabilityMatrix } = await import("../engine/capabilities.mjs");
  for (const [f, fam] of Object.entries(FAMILIES))
    for (const [t, task] of Object.entries(fam.tasks)) {
      if (task.unavailable) continue;
      assert.ok(["ready", "partial", "experimental", "research"].includes(task.status || "ready"), `${f}/${t} status`);
      assert.ok(["official", "community", "composed"].includes(task.evidence), `${f}/${t} evidence`);
      assert.ok(["inference", "graph"].includes(task.verified), `${f}/${t} verified`);
      if (["partial", "experimental"].includes(task.status)) assert.ok(task.statusNote, `${f}/${t} explains its ${task.status} status`);
    }
  for (const row of capabilityMatrix(FAMILIES))
    for (const [f, cell] of Object.entries(row.cells)) if (cell.status === "unsupported") assert.ok(cell.note, `${f} ${row.id}: unsupported needs a reason`);
});

test("docs/CURRENT_CAPABILITY_AUDIT.md is generated from the engine (run npm run docs)", async () => {
  const { render, AUDIT_DOC } = await import("../scripts/build-capability-matrix.mjs");
  const text = await fs.readFile(AUDIT_DOC, "utf8");
  assert.equal(render(text, "audit"), text);
});
