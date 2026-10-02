// Regenerates the capability matrix in docs/CAPABILITY_MATRIX.md from the engine's own task
// declarations (engine/capabilities.mjs). `npm run docs` runs it; tests/docs.test.mjs fails
// when the file is out of date, so the matrix can never drift from the code.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES } from "../engine/index.mjs";
import { capabilityMatrix, STATUS } from "../engine/capabilities.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MATRIX_DOC = path.join(root, "docs", "CAPABILITY_MATRIX.md");

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

export function render(text) {
  const re = /(<!-- generated:matrix -->)[\s\S]*?(<!-- \/generated:matrix -->)/;
  if (!re.test(text)) throw new Error("docs/CAPABILITY_MATRIX.md is missing the generated:matrix markers");
  return text.replace(re, `$1\n${buildMatrix()}\n$2`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const before = await fs.readFile(MATRIX_DOC, "utf8");
  const after = render(before);
  await fs.writeFile(MATRIX_DOC, after);
  console.log(after === before ? "docs/CAPABILITY_MATRIX.md is already up to date" : "Updated docs/CAPABILITY_MATRIX.md");
}
