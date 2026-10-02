// workflows/ is generated: it must match what the engine builds today (run npm run export-workflows).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { exportAll, OUT_DIR } from "../scripts/export-workflows.mjs";

test("exported workflows match the engine output (npm run export-workflows)", () => {
  const out = exportAll();
  const onDisk = fs.readdirSync(OUT_DIR, { recursive: true }).filter((f) => /\.(json|md)$/.test(f)).map((f) => f.replaceAll("\\", "/"));
  assert.deepEqual(onDisk.sort(), Object.keys(out).sort(), "same set of files");
  for (const [rel, text] of Object.entries(out)) assert.equal(fs.readFileSync(path.join(OUT_DIR, rel), "utf8"), text, rel);
});
