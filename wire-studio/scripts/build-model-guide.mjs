// Regenerates the model tables, the A–Z index and the sample folder tree in
// docs/MODEL-FOLDERS.md from engine/model-list.mjs (the same list Setup uses).
//   npm run docs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_LIST, FAMILY_ORDER, OTHER_FOLDERS, AUTO_FOLDERS } from "../engine/model-list.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GUIDE = path.join(root, "docs", "MODEL-FOLDERS.md");

const TOP = ["checkpoints", "diffusion_models", "loras", "text_encoders", "vae", "model_patches", "controlnet", "upscale_models", "ultralytics", "insightface", "facerestore_models", "geometry_estimation", "background_removal"];
const TOP_NOTE = {
  checkpoints: "SDXL family only (all-in-one checkpoints)",
  diffusion_models: "Anima, Z-Image and Krea 2 models (UNET-only files)",
  loras: "one folder per family, any sub-folders below it",
  text_encoders: "shared, picked by file name",
  vae: "shared, picked by file name",
  model_patches: "control and inpaint patches (plural folder name)",
  controlnet: "SDXL ControlNets",
  upscale_models: "all families",
  ultralytics: "face / hand detectors (Impact Subpack)",
  insightface: "face swap (ReActor)",
  facerestore_models: "face restore (ReActor)",
  geometry_estimation: "native depth maps (Depth Anything 3)",
  background_removal: "native background removal (BiRefNet)",
};
const placeholder = (m) => /\s/.test(m.file);
const shown = (m) => (placeholder(m) ? `(${m.file})` : m.file);
const needLabel = { required: "Required", recommended: "Recommended", optional: "Optional", alternative: "Alternative", example: "Your files" };

export function buildTree() {
  const tree = { folders: new Map(), files: [] };
  const node = (p) => p.split("/").reduce((n, part) => {
    if (!n.folders.has(part)) n.folders.set(part, { folders: new Map(), files: [] });
    return n.folders.get(part);
  }, tree);
  for (const top of TOP) node(top);
  for (const m of MODEL_LIST) {
    if (m.duplicate) continue;
    const family = m.file === "qwen_image_vae.safetensors" ? "Anima + Krea 2" : m.family;
    node(m.path).files.push({ name: shown(m), note: `${family} · ${m.role}${m.need === "required" || m.need === "example" ? "" : ` · ${m.need}`}` });
  }
  for (const f of OTHER_FOLDERS) node(f.path).note = f.note;
  for (const [name, n] of tree.folders) if (TOP_NOTE[name]) n.note = TOP_NOTE[name];
  const lines = ["ComfyUI/models/"];
  const COL = 58;
  const row = (prefix, name, note) => {
    const left = prefix + name;
    return note ? left + " ".repeat(Math.max(2, COL - [...left].length)) + note : left;
  };
  const walk = (n, prefix) => {
    const items = [...[...n.folders].map(([name, child]) => ({ name: name + "/", child, note: child.note })), ...n.files];
    items.forEach((it, i) => {
      const last = i === items.length - 1;
      lines.push(row(prefix + (last ? "└── " : "├── "), it.name, it.child ? (it.note ? "← " + it.note : "") : it.note));
      if (it.child) walk(it.child, prefix + (last ? "    " : "│   "));
    });
  };
  walk(tree, "");
  return "```\n" + lines.join("\n") + "\n```";
}

const link = (m) => (!m.url ? "—" : `[${/\/resolve\//.test(m.url) ? "Download" : "Project page"}](${m.url})`);
const cellFile = (m) => (placeholder(m) ? `*${m.file}*` : `\`${m.file}\``) + (m.display && !placeholder(m) && m.display !== m.file && !m.display.startsWith(m.file) ? ` — ${m.display}` : "");

export function buildTables() {
  const out = [
    "**Need:** *Required* — the family (or, for shared helpers, the task) cannot run without it · *Recommended* — needed by a main task or for clearly better results · *Optional* — enables an extra feature · *Alternative* — use instead of the file above it · *Your files* — where your own models go.",
    "",
  ];
  for (const family of FAMILY_ORDER) {
    out.push(`### ${family === "Shared" ? "Shared helpers (all families)" : family}`, "", "| File | Folder (inside models/) | Used for | Need | Get it |", "|---|---|---|---|---|");
    for (const m of MODEL_LIST.filter((x) => x.family === family)) out.push(`| ${cellFile(m)} | \`${m.path}/\` | ${m.role}: ${m.tasks} | ${needLabel[m.need]} | ${link(m)} |`);
    out.push("");
  }
  out.push("### Downloaded automatically", "", "| What | Where | By |", "|---|---|---|", ...AUTO_FOLDERS.map((a) => `| ${a.what} | \`${a.where}\` | ${a.by} |`), "");
  return out.join("\n").trim();
}

export function buildIndex() {
  const seen = new Set();
  const rows = MODEL_LIST.filter((m) => !placeholder(m))
    .filter((m) => !seen.has(m.file) && seen.add(m.file))
    .sort((a, b) => a.file.toLowerCase().localeCompare(b.file.toLowerCase()))
    .map((m) => `| \`${m.file}\` | \`models/${m.path}/\` | ${m.file === "qwen_image_vae.safetensors" ? "Anima, Krea 2" : m.family} |`);
  return ["| File | Folder | Family |", "|---|---|---|", ...rows].join("\n");
}

export const SECTIONS = { tree: buildTree, models: buildTables, index: buildIndex };

export function render(text) {
  for (const [name, build] of Object.entries(SECTIONS)) {
    const re = new RegExp(`(<!-- generated:${name} -->)[\\s\\S]*?(<!-- /generated:${name} -->)`);
    if (!re.test(text)) throw new Error(`docs/MODEL-FOLDERS.md is missing the generated:${name} markers`);
    text = text.replace(re, `$1\n${build()}\n$2`);
  }
  return text;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const before = await fs.readFile(GUIDE, "utf8");
  const after = render(before);
  await fs.writeFile(GUIDE, after);
  console.log(after === before ? "docs/MODEL-FOLDERS.md is already up to date" : "Updated docs/MODEL-FOLDERS.md");
}
