// Client state shared by the views. Form values are saved to the server (debounced), so they
// load instantly on any browser; masks and local previews live only in this tab.
import { api } from "./api.js";
import { debounce } from "./ui.js";

export const S = {
  schema: null,
  settings: {},
  forms: {},
  connection: { ok: false },
  inventory: null,
  readiness: null,
  stale: false,
  assignments: {},
  jobs: [],
  family: "anima",
  task: "generate",
  view: {}, // "family/task" → { jobId, index, mode: "input" | "result" }
  masks: new Map(), // image name → mask canvas
  localUrls: new Map(), // image name → object URL of the file just uploaded
};

export const key = (f = S.family, t = S.task) => `${f}/${t}`;
export const famSchema = (f = S.family) => S.schema.families[f];
export const taskSchema = (f = S.family, t = S.task) => famSchema(f).tasks[t];
export const taskMeta = (t = S.task) => S.schema.tasks[t];
export const readiness = (f = S.family, t = S.task) => S.readiness?.[f]?.[t] || null;
export const famInventory = (f = S.family) => S.inventory?.families?.[f] || {};

const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

// Defaults: family sampling defaults + each field's own default.
function defaultsFor(f, t) {
  const fam = famSchema(f);
  const out = { ...fam.defaults, randomSeed: true, seed: 0, loras: [], model: "" };
  for (const fld of taskSchema(f, t).fields || []) {
    if (fld.default !== undefined) out[fld.key] = fld.default;
    if (fld.type === "image") out[fld.key] = null;
    if (fld.type === "edges") Object.assign(out, { left: 0, right: 0, top: 0, bottom: 0 });
  }
  return out;
}
export function values(f = S.family, t = S.task) {
  const k = key(f, t);
  if (!S.forms[k] || !S.forms[k].__v) S.forms[k] = { ...defaultsFor(f, t), ...(S.forms[k] || {}), __v: 1 };
  return S.forms[k];
}

const savers = new Map();
export function save(f = S.family, t = S.task) {
  const k = key(f, t);
  if (!savers.has(k)) savers.set(k, debounce(() => api.saveForm(f, t, S.forms[k]).catch(() => {}), 450));
  savers.get(k)();
}
export function setValue(name, value, { f = S.family, t = S.task, silent = false } = {}) {
  values(f, t)[name] = value;
  save(f, t);
  if (!silent) emit("form", { name });
}

export const jobById = (id) => S.jobs.find((j) => j.id === id);
export const isActive = (j) => j && (j.status === "queued" || j.status === "running");
export function upsertJob(job) {
  const i = S.jobs.findIndex((j) => j.id === job.id);
  if (i >= 0) S.jobs[i] = { ...S.jobs[i], ...job };
  else S.jobs.unshift(job);
  S.jobs.sort((a, b) => b.created - a.created);
}
