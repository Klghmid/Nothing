// The capability matrix (family × capability), computed from what each family's tasks
// declare — never written by hand, so documentation cannot drift from the engine.
//
// A task declares:
//   status    "ready" | "partial" | "experimental" | "research"  (default "ready")
//             research = RESEARCH_ONLY: documented but never offered as a runnable task
//   evidence  "official"  — follows a Comfy-Org template or the model author's own workflow
//             "community" — a community model / node pack and its documented usage
//             "composed"  — Wire Studio's own composition of documented nodes
//   verified  "inference" — run on a GPU (Anima Studio live tests) in this form
//             "graph"     — accepted by a live ComfyUI's validator; not yet run on a GPU
// Choices of a `kind` select may carry their own status (e.g. one experimental control type).
// A family lists capabilities it deliberately does not offer in `unsupported` (with the reason).
import { CONTROL_KINDS } from "./catalog.mjs";

export const STATUS = { ready: "READY", partial: "PARTIAL", experimental: "EXPERIMENTAL", research: "RESEARCH_ONLY", missing: "MISSING", unsupported: "UNSUPPORTED" };
const RANK = { ready: 4, partial: 3, experimental: 2, research: 1 };

// Each capability is provided by a task, a `kind` choice of a task, an image field of a task, or
// a family-free tool.
export const CAPABILITIES = [
  { id: "generate", label: "Generate", from: [{ task: "generate" }] },
  { id: "img2img", label: "Img2Img", from: [{ task: "img2img" }] },
  { id: "inpaint", label: "Inpaint", from: [{ task: "inpaint" }] },
  { id: "outpaint", label: "Outpaint", from: [{ task: "outpaint" }] },
  { id: "control", label: "Control", from: [{ task: "control" }] },
  { id: "img2img-control", label: "Controlled Img2Img", from: [{ task: "img2img-control" }] },
  { id: "pose", label: "Pose", from: [{ task: "pose" }, { task: "control", kind: "pose" }] },
  { id: "depth", label: "Depth", from: [{ task: "control", kind: "depth" }] },
  { id: "canny", label: "Canny", from: [{ task: "control", kind: "canny" }] },
  { id: "lineart", label: "Lineart", from: [{ task: "control", kind: "lineart" }] },
  { id: "face", label: "Face Fix", from: [{ task: "face" }] },
  { id: "hands", label: "Hand Fix", from: [{ task: "hands" }] },
  { id: "faceswap", label: "Face Swap", from: [{ task: "faceswap" }] },
  { id: "upscale", label: "Upscale", from: [{ task: "upscale" }] },
  { id: "remove-bg", label: "Remove Background", tool: "remove-bg" },
  { id: "style", label: "Style Reference", from: [{ task: "generate", field: "style1" }] },
  { id: "identity", label: "Identity Editing", from: [{ task: "edit" }] },
];

// Family-free tools (engine/index.mjs buildUtility), with their own status.
export const TOOLS = {
  "remove-bg": { status: "ready", evidence: "community", verified: "graph", note: "ComfyUI-RMBG BiRefNet / RMBG; no model family involved" },
};

const choicesOf = (task, key) => task.fields?.find((f) => f.key === key)?.choices;
function provider(fam, src) {
  const task = fam.tasks[src.task];
  if (!task || task.unavailable) return null;
  if (src.kind) {
    const choice = (choicesOf(task, "kind") || []).find?.((c) => c.value === src.kind);
    if (!choice) return null;
    return { task: src.task, kind: src.kind, status: choice.status || task.status || "ready", evidence: choice.evidence || task.evidence, verified: choice.verified || task.verified, note: choice.note || "" };
  }
  if (src.field && !task.fields?.some((f) => f.key === src.field)) return null;
  return { task: src.task, status: task.status || "ready", evidence: task.evidence, verified: task.verified, note: task.statusNote || task.badgeNote || "" };
}

export function capabilityMatrix(families) {
  const rows = [];
  for (const cap of CAPABILITIES) {
    const cells = {};
    for (const [id, fam] of Object.entries(families)) {
      if (cap.tool) {
        cells[id] = { ...TOOLS[cap.tool], status: TOOLS[cap.tool].status, shared: true };
        continue;
      }
      const found = cap.from.map((s) => provider(fam, s)).filter(Boolean).sort((a, b) => RANK[b.status] - RANK[a.status]);
      if (found.length) cells[id] = found[0];
      else {
        const off = fam.unsupported?.[cap.id] || (cap.from.some((s) => fam.tasks[s.task]?.unavailable) ? fam.tasks[cap.from[0].task]?.unavailable : null);
        cells[id] = off ? { status: "unsupported", note: off } : { status: "missing", note: fam.missing?.[cap.id] || "" };
      }
    }
    rows.push({ ...cap, cells });
  }
  return rows;
}

export const kindLabel = (k) => CONTROL_KINDS[k] || k;
