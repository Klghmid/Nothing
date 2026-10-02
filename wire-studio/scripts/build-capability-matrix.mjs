// Regenerates docs/CAPABILITY_MATRIX.md (family × capability) and docs/CURRENT_CAPABILITY_AUDIT.md
// (one row per workflow) from the engine's own task declarations, requirement checks, tests and
// exports. `npm run docs` runs it; tests/docs.test.mjs fails when either file is out of date, so
// neither can drift from the code.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fsSync from "node:fs";
import { FAMILIES, requirements } from "../engine/index.mjs";
import { capabilityMatrix, combinationRows, STATUS } from "../engine/capabilities.mjs";
import { TASKS } from "../engine/catalog.mjs";
import { variantParams } from "../engine/variants.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MATRIX_DOC = path.join(root, "docs", "CAPABILITY_MATRIX.md");
export const AUDIT_DOC = path.join(root, "docs", "CURRENT_CAPABILITY_AUDIT.md");

const EVIDENCE = { official: "official template / model author", community: "community model or node pack", composed: "Wire Studio composition of documented nodes" };

export function buildMatrix() {
  const rows = capabilityMatrix(FAMILIES);
  const ids = Object.keys(FAMILIES);
  const cell = (c) => `${STATUS[c.status]}${c.verified === "graph" ? " †" : ""}`;
  const out = ["| Capability | " + ids.map((id) => FAMILIES[id].label).join(" | ") + " |", "|---|" + ids.map(() => "---|").join("")];
  for (const r of rows) out.push(`| ${r.label} | ${ids.map((id) => cell(r.cells[id])).join(" | ")} |`);
  out.push("", "**Where each cell comes from**", "");
  for (const id of ids) {
    out.push(`- **${FAMILIES[id].label}**`);
    for (const r of rows) {
      const c = r.cells[id];
      const src = c.shared ? "shared tool (no model family)" : c.task ? `task \`${c.task}\`${c.kind ? ` · type \`${c.kind}\`` : ""}` : "";
      const bits = [src, c.evidence ? EVIDENCE[c.evidence] : "", c.verified === "inference" ? "run on a GPU" : c.verified === "graph" ? "graph validated, not yet run on a GPU" : "", c.note].filter(Boolean);
      out.push(`  - ${r.label}: ${STATUS[c.status]}${bits.length ? " — " + bits.join("; ") : ""}`);
    }
  }
  return out.join("\n");
}

export function buildCombos() {
  const out = [];
  for (const fam of Object.values(FAMILIES)) {
    const rows = combinationRows(fam);
    if (!rows.length) continue;
    out.push(`**${fam.label}**`, "", "| Combination | Status | How | Notes |", "|---|---|---|---|");
    for (const r of rows) {
      const how = r.task ? [`task \`${r.task}\``, r.evidence ? EVIDENCE[r.evidence] : "", r.verified === "graph" ? "graph validated, not yet run on a GPU" : r.verified === "inference" ? "run on a GPU" : ""].filter(Boolean).join("; ") : "—";
      out.push(`| ${r.label} | ${STATUS[r.status]} | ${how} | ${String(r.note || "").replaceAll("|", "\\|")} |`);
    }
    out.push("");
  }
  return out.join("\n").trim();
}

// Tests that name a workflow explicitly (beyond the per-workflow build, purity and
// real-definition checks every workflow gets), found by reading the test files.
function namedTests(familyId, taskId) {
  const dir = path.join(root, "tests");
  const hits = [];
  for (const f of fsSync.readdirSync(dir).filter((n) => n.endsWith(".test.mjs"))) {
    const text = fsSync.readFileSync(path.join(dir, f), "utf8");
    const re = new RegExp(`buildWorkflow\\(\\s*"${familyId}"\\s*,\\s*"${taskId}"`, "g");
    const n = (text.match(re) || []).length;
    if (n) hits.push(`${f} ×${n}`);
  }
  return hits;
}

export function buildAudit() {
  const out = [
    "| Family | Task | Implementation | Status | Evidence · verified | Required nodes | Required models | Recommended add-ons | UI | Tests | Export |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const esc = (x) => String(x).replaceAll("|", "\\|");
  for (const [familyId, fam] of Object.entries(FAMILIES))
    for (const [taskId, task] of Object.entries(fam.tasks)) {
      const label = TASKS[taskId]?.label || taskId;
      const impl = `\`engine/families/${familyId}.mjs\` → \`tasks["${taskId}"].build\``;
      if (task.unavailable) {
        out.push(`| ${fam.label} | ${label} | — | UNSUPPORTED | — | — | — | — | listed as n/a with the reason | refusal test | — |`);
        continue;
      }
      const r = requirements(familyId, taskId);
      const req = (list, f) => list.filter((x) => x.level === "required").map(f);
      const nodes = req(r.nodes, (n) => `${n.types.join(" or ")}${n.pack ? ` (${n.pack})` : ""}`);
      const models = req(r.models, (m) => (m.file ? `\`${m.file}\`` : m.label));
      const extra = [...r.nodes.filter((n) => n.level !== "required").map((n) => n.types.join(" or ")), ...r.models.filter((m) => m.level !== "required").map((m) => m.file || m.label)];
      const ui = `${TASKS[taskId]?.group || "—"}${task.badge || task.status === "experimental" ? ` · badge "${task.badge || "Experimental"}"` : ""}`;
      const tests = ["build + family purity", "real definitions", ...namedTests(familyId, taskId)];
      const exports = variantParams(familyId, taskId, task).map((v) => `[${v.file || taskId}](../workflows/${familyId}/${v.file ? `${taskId}-${v.file}` : taskId}.json)`);
      const status = STATUS[task.status || "ready"] + (task.statusNote ? ` — ${task.statusNote}` : "");
      out.push(`| ${fam.label} | ${label} | ${impl} | ${esc(status)} | ${task.evidence} · ${task.verified === "inference" ? "run on a GPU" : "graph only"} | ${esc(nodes.join("<br>") || "core only")} | ${esc(models.join("<br>"))} | ${esc(extra.join("<br>") || "—")} | ${ui} | ${tests.join("<br>")} | ${exports.join(" ")} |`);
    }
  return out.join("\n");
}

const DOCS = { matrix: buildMatrix, audit: buildAudit, combos: buildCombos };
export function render(text, name = "matrix") {
  const re = new RegExp(`(<!-- generated:${name} -->)[\\s\\S]*?(<!-- \\/generated:${name} -->)`);
  if (!re.test(text)) throw new Error(`missing the generated:${name} markers`);
  return text.replace(re, `$1\n${DOCS[name]()}\n$2`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  for (const [file, names] of [[MATRIX_DOC, ["matrix", "combos"]], [AUDIT_DOC, ["audit"]]]) {
    const before = await fs.readFile(file, "utf8");
    const after = names.reduce((text, name) => render(text, name), before);
    await fs.writeFile(file, after);
    console.log(after === before ? `${path.relative(root, file)} is already up to date` : `Updated ${path.relative(root, file)}`);
  }
}
