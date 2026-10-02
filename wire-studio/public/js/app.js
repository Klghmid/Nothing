// Wire Studio — app shell: navigation, running jobs, live updates.
import { h, put, icon, toast, closeMenu } from "./ui.js";
import { api, viewUrl } from "./api.js";
import { S, key, values, setValue, famSchema, taskSchema, taskMeta, readiness, on, upsertJob, jobById, isActive } from "./state.js";
import { renderPanel, imageFromFile, setImage, pickFile, withUpload } from "./form.js";
import { renderStage, focusJob, updateProgress, updatePreview, maskHasPaint, exportMask, undoMask, primaryField, hasMask } from "./stage.js";
import { lightbox, gallery, setup, renderQueue, pickResult, closeOverlay, useAsMenu, invalidateGallery, flatten } from "./views.js";

const mine = new Set(); // jobs started from this tab (toast + auto-show when finished)

// ---------- theme ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("wire-theme", t);
  } catch {}
}
let savedTheme = "dark";
try {
  savedTheme = localStorage.getItem("wire-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
} catch {}
applyTheme(savedTheme);

// ---------- shell ----------
function renderFamilies() {
  const nav = document.getElementById("families");
  const colors = { anima: "#a78bfa", sdxl: "#2dd4bf", zimage: "#fbbf24", krea2: "#fb7185" };
  put(nav, 
    ...S.schema.order.map((f) => {
      const fam = famSchema(f);
      return h("button", { class: "family", "aria-pressed": String(S.family === f), style: { "--c": colors[f] }, title: fam.tagline, onclick: () => goto({ family: f }) }, h("span", { class: "dot" }), fam.label);
    }),
  );
  document.documentElement.dataset.family = S.family;
}
const collapsed = new Set((() => {
  try {
    return JSON.parse(localStorage.getItem("wire-folded") || "[]");
  } catch {
    return [];
  }
})());
function toggleGroup(group) {
  collapsed.has(group) ? collapsed.delete(group) : collapsed.add(group);
  try {
    localStorage.setItem("wire-folded", JSON.stringify([...collapsed]));
  } catch {}
  renderTasks();
}
function renderTasks() {
  const aside = document.getElementById("tasks");
  const fam = famSchema();
  const items = [];
  for (const group of S.schema.groups) {
    const tasks = Object.entries(S.schema.tasks).filter(([id, t]) => t.group === group && fam.tasks[id]);
    if (!tasks.length) continue;
    // Long groups (Krea 2's Identity Edit) fold; the current task's group always stays open.
    const phone = typeof matchMedia === "function" && matchMedia("(max-width: 900px)").matches; // titles are hidden there
    const folded = !phone && collapsed.has(group) && !tasks.some(([id]) => id === S.task);
    items.push(h("button", { class: "group-title", "aria-expanded": String(!folded), onclick: () => toggleGroup(group) }, group, tasks.length > 6 ? h("span", { class: "count" }, String(tasks.length)) : null));
    if (folded) continue;
    for (const [id, t] of tasks) {
      const r = readiness(S.family, id);
      const off = !!fam.tasks[id].unavailable;
      items.push(
        h(
          "button",
          { class: "task" + (off ? " off" : ""), "aria-current": S.task === id ? "page" : "false", onclick: () => goto({ task: id }), title: off ? fam.tasks[id].unavailable : t.about },
          icon(t.icon),
          h("span", { class: "label" }, t.label),
          off ? h("span", { class: "pill" }, "n/a") : r && r.state !== "ready" ? h("span", { class: "flag " + r.state, title: r.state === "missing" ? "Needs setup" : "Works; add-ons recommended" }) : null,
        ),
      );
    }
  }
  items.push(h("hr"), h("div", { class: "group-title" }, "Tools"), h("button", { class: "task", onclick: removeBgFromFile, title: "Remove the background of any image (no model family involved)" }, icon("scissors"), h("span", { class: "label" }, "Remove background")));
  put(aside, ...items);
}
function renderTopbar() {
  const active = S.jobs.filter(isActive).length;
  put(document.getElementById("queue-button"), icon(active ? "loader" : "queue", active ? "spin" : ""), h("span", {}, "Queue"), active ? h("span", { class: "count" }, String(active)) : null);
  put(document.getElementById("gallery-button"), icon("gallery"), h("span", {}, "Gallery"));
  put(document.getElementById("setup-button"), h("span", { class: "status-dot " + (S.connection.ok ? "ok" : "bad") }), h("span", {}, "Setup"));
  document.getElementById("setup-button").title = S.connection.ok ? `Connected to ${S.connection.url}` : "ComfyUI is not connected";
}
function renderAll() {
  renderFamilies();
  renderTasks();
  renderTopbar();
  renderPanel();
  renderStage();
  renderQueue();
}

function goto({ family = S.family, task, jobId } = {}) {
  const famChanged = family !== S.family;
  S.family = family;
  if (task) S.task = task;
  if (!famSchema().tasks[S.task]) S.task = "generate";
  if (jobId) S.view[key()] = { jobId, index: 0, mode: "result" };
  if (famChanged || task) api.saveSettings({ family: S.family, task: S.task }).catch(() => {});
  closeMenu();
  renderAll();
}

// ---------- running ----------
async function buildParams() {
  const v = values();
  const t = taskSchema();
  const params = {};
  for (const [k, val] of Object.entries(v)) if (!k.startsWith("__") && k !== "randomSeed") params[k] = val;
  for (const f of t.fields) if (f.type === "image") params[f.key] = v[f.key]?.name || undefined;
  const primary = primaryField();
  if (primary && v[primary.key]) Object.assign(params, { imageW: v[primary.key].w, imageH: v[primary.key].h });
  if (v.randomSeed !== false) params.seed = Math.floor(Math.random() * 2 ** 32);
  const maskField = t.fields.find((f) => f.type === "mask");
  if (maskField) {
    if (!v.image) throw new Error("Add the image first");
    // An optional mask (e.g. "Limit to an area") is sent only when something was painted.
    if (maskHasPaint(v.image)) params.mask = (await api.upload(await exportMask(v.image), `wire-mask-${Date.now()}.png`)).name;
    else if (!maskField.optional) throw new Error("Paint the area to change on the image first");
    else delete params.mask;
  }
  return params;
}
async function run() {
  const btn = document.getElementById("run");
  if (!btn || btn.disabled) return;
  const meta = taskMeta();
  btn.disabled = true;
  put(btn, icon("loader", "spin"), "Sending…");
  try {
    const params = await buildParams();
    const { job } = await api.run(S.family, S.task, params);
    mine.add(job.id);
    upsertJob(job);
    focusJob(job);
    renderStage();
    renderTopbar();
    renderQueue();
  } catch (e) {
    toast(e.message, "bad", 7000);
  } finally {
    const b = document.getElementById("run");
    if (b) {
      b.disabled = false;
      put(b, icon("play"), meta.run);
    }
  }
}
async function exportWorkflow() {
  try {
    const params = await buildParams();
    const { prompt } = await api.workflow(S.family, S.task, params);
    const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(prompt, null, 2)], { type: "application/json" })), download: `wire-studio-${S.family}-${S.task}.json` });
    a.click();
    toast("Workflow saved (API format). Drag it into ComfyUI to open it.", "ok");
  } catch (e) {
    toast(e.message, "bad", 7000);
  }
}

// Bring a result into a task as its input image.
async function imageMeta(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return { w: img.naturalWidth, h: img.naturalHeight };
}
async function promote(image) {
  const { name } = await api.promote(image);
  return { name, ...(await imageMeta(viewUrl(image))) };
}
async function useAs({ family, task, utility, job, index }) {
  try {
    const image = job.images[index || 0];
    if (utility) return runUtility(utility, await promote(image));
    const img = await promote(image);
    const fld = (S.schema.families[family].tasks[task].fields || []).find((f) => f.type === "image");
    document.querySelector(".lightbox")?.remove();
    await setImage(fld.key, img, { f: family, t: task });
    S.view[`${family}/${task}`] = { jobId: null, index: 0, mode: "input" };
    goto({ family, task });
    toast(`Image added to ${taskMeta(task).label}`, "ok", 2000);
  } catch (e) {
    toast(e.message, "bad");
  }
}
async function runUtility(kind, img) {
  try {
    const { job } = await api.run("utility", kind, { image: img.name, imageW: img.w, imageH: img.h });
    mine.add(job.id);
    upsertJob(job);
    renderTopbar();
    renderQueue();
    toast("Removing background… the result opens when it is ready", "", 3000);
  } catch (e) {
    toast(e.message, "bad", 7000);
  }
}
async function removeBgFromFile() {
  const file = await pickFile();
  if (!file) return;
  try {
    runUtility("remove-bg", await imageFromFile(file));
  } catch (e) {
    toast(e.message, "bad");
  }
}
function restore(job) {
  if (!S.schema.families[job.family]?.tasks[job.task]?.fields) return toast("These settings cannot be restored here");
  const t = S.schema.families[job.family].tasks[job.task];
  const v = values(job.family, job.task);
  const p = job.params || {};
  for (const f of t.fields) {
    if (f.type === "image") v[f.key] = p[f.key] ? { name: p[f.key], w: f.key === "image" ? p.imageW : 0, h: f.key === "image" ? p.imageH : 0 } : null;
    else if (f.type === "size") Object.assign(v, { width: p.width, height: p.height });
    else if (f.type === "edges") Object.assign(v, { left: p.left, right: p.right, top: p.top, bottom: p.bottom });
    else if (f.type === "sampling") Object.assign(v, { steps: p.steps, cfg: p.cfg, sampler: p.sampler, scheduler: p.scheduler });
    else if (f.type !== "mask" && p[f.key] !== undefined) v[f.key] = p[f.key];
  }
  Object.assign(v, { seed: job.seed, randomSeed: false });
  if (p.model !== undefined) v.model = p.model;
  if (p.loras) v.loras = structuredClone(p.loras);
  setValue("seed", job.seed, { f: job.family, t: job.task, silent: true });
  goto({ family: job.family, task: job.task });
  toast(`Settings restored (seed ${job.seed} fixed)${hasMask(t) ? " — paint the mask again" : ""}`, "ok");
}

// ---------- live updates ----------
let progressDraw = 0;
function connectEvents() {
  const es = new EventSource("/api/events");
  let dropped = false;
  es.addEventListener("open", async () => {
    if (!dropped) return;
    dropped = false;
    try {
      const { jobs } = await api.jobs({ limit: 80 });
      jobs.forEach(upsertJob);
      renderStage();
      renderTopbar();
      renderQueue();
    } catch {}
  });
  es.addEventListener("error", () => (dropped = true));
  es.addEventListener("job", (e) => {
    const job = JSON.parse(e.data);
    const before = jobById(job.id);
    upsertJob(job);
    renderTopbar();
    renderQueue();
    const shown = S.view[`${job.family}/${job.task}`]?.jobId === job.id && job.family === S.family && job.task === S.task;
    if (shown || (job.family === S.family && job.task === S.task && !isActive(job))) renderStage();
    if (before && isActive(before) && !isActive(job)) {
      invalidateGallery();
      if (mine.has(job.id)) {
        mine.delete(job.id);
        if (job.status === "done" && job.family === "utility") lightbox(flatten([job]), 0);
        else if (job.status === "done" && !shown) toast(`${taskMeta(job.task)?.label || "Job"} finished`, "ok");
        else if (job.status === "error") toast(job.error || "The run failed", "bad", 8000);
      }
    }
  });
  es.addEventListener("progress", (e) => {
    const p = JSON.parse(e.data);
    const job = jobById(p.id);
    if (!job) return;
    job.progress = p;
    if (job.status === "queued") job.status = "running";
    updateProgress(job);
    if (Date.now() - progressDraw > 500) {
      progressDraw = Date.now();
      renderQueue();
    }
  });
  es.addEventListener("preview", (e) => {
    const { id } = JSON.parse(e.data);
    const job = jobById(id);
    if (job) job.hasPreview = true;
    updatePreview(id);
  });
  es.addEventListener("removed", (e) => {
    const { id } = JSON.parse(e.data);
    S.jobs = S.jobs.filter((j) => j.id !== id);
    renderStage();
    renderQueue();
  });
  es.addEventListener("connection", (e) => (S.connection.live = JSON.parse(e.data).live));
}

function applyInventory(data) {
  if (data.connection) S.connection = data.connection;
  if (data.inventory) S.inventory = data.inventory;
  if (data.readiness) S.readiness = data.readiness;
  S.stale = !!data.stale;
}

// ---------- events from the views ----------
on("run", run);
on("export", exportWorkflow);
on("form", ({ name }) => {
  renderPanel();
  const primary = primaryField();
  if (primary && name === primary.key) (S.view[key()] ||= { jobId: null, index: 0 }).mode = "input";
  if (["left", "right", "top", "bottom", "style1"].includes(name) || /image/i.test(name)) renderStage();
});
on("mask", () => renderPanel());
on("cancel", async (id) => {
  try {
    upsertJob((await api.cancel(id)).job);
    renderStage();
    renderQueue();
    renderTopbar();
  } catch (e) {
    toast(e.message, "bad");
  }
});
on("remove", async (id) => {
  await api.remove(id).catch(() => {});
  S.jobs = S.jobs.filter((j) => j.id !== id);
  renderQueue();
  renderStage();
});
on("lightbox", ({ job, index }) => {
  const items = flatten([job]);
  lightbox(items, index);
});
on("use-as", ({ anchor, job, index }) => useAsMenu(anchor, job, index, useAs));
on("restore", restore);
on("goto", (g) => goto(g));
on("pick-image", ({ field }) =>
  pickResult(async (it) => {
    try {
      await setImage(field, await promote(it.image));
    } catch (e) {
      toast(e.message, "bad");
    }
  }),
);
on("open-setup", (focus) => setup(focus));
on("theme", () => {
  applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  if (!document.getElementById("overlay").hidden) setup();
});
on("connect", async (url) => {
  try {
    toast("Connecting…", "", 1500);
    const data = await api.connect(url);
    applyInventory(data);
    renderAll();
    setup();
    toast(data.connection.ok ? `Connected to ComfyUI ${data.connection.version || ""}` : data.connection.error || "Could not connect", data.connection.ok ? "ok" : "bad", 5000);
  } catch (e) {
    toast(e.message, "bad");
  }
});
on("refresh", async () => {
  try {
    applyInventory(await api.refresh());
    renderAll();
    if (!document.getElementById("overlay").hidden) setup();
    toast(S.connection.ok ? "Models and nodes re-checked" : "ComfyUI is not reachable", S.connection.ok ? "ok" : "bad", 2500);
  } catch (e) {
    toast(e.message, "bad");
  }
});
on("assign", async ({ name, family }) => {
  try {
    const data = await api.assign(name, family || null);
    applyInventory(data);
    const b = await api.bootstrap();
    S.assignments = b.assignments;
    renderAll();
    setup({ tab: "library" });
    toast(family ? `Assigned to ${famSchema(family).label}` : "Assignment removed", "ok", 2000);
  } catch (e) {
    toast(e.message, "bad");
  }
});

// ---------- global input ----------
document.getElementById("queue-button").onclick = () => {
  const q = document.getElementById("queue");
  q.hidden = !q.hidden;
  renderQueue();
};
document.getElementById("gallery-button").onclick = () => gallery();
document.getElementById("setup-button").onclick = () => setup();
document.addEventListener("pointerdown", (e) => {
  const q = document.getElementById("queue");
  if (!q.hidden && !q.contains(e.target) && !document.getElementById("queue-button").contains(e.target)) q.hidden = true;
});
document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    if (document.getElementById("overlay").hidden) run();
  } else if (e.key === "Escape") {
    closeMenu();
    document.getElementById("queue").hidden = true;
    if (document.querySelector(".lightbox")) document.querySelector(".lightbox").remove();
    else closeOverlay();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing && hasMask()) {
    e.preventDefault();
    undoMask();
  }
});
// Paste an image anywhere: it goes to the first empty image slot (or the main one).
document.addEventListener("paste", async (e) => {
  const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
  if (!file || !S.schema) return;
  const fields = (taskSchema().fields || []).filter((f) => f.type === "image");
  if (!fields.length) return toast("This task does not take an image");
  e.preventDefault();
  const target = fields.find((f) => !values()[f.key]) || fields[0];
  withUpload(target.key, file);
});
// Dropping an image on the stage fills the main image slot.
document.getElementById("stage").addEventListener("dragover", (e) => e.preventDefault());
document.getElementById("stage").addEventListener("drop", async (e) => {
  if (e.defaultPrevented) return;
  e.preventDefault();
  const file = e.dataTransfer.files?.[0];
  const fld = primaryField();
  if (!file || !fld) return;
  withUpload(fld.key, file);
});

// ---------- start ----------
async function start() {
  put(document.getElementById("stage"), h("div", { class: "canvas-wrap" }, h("div", { class: "empty" }, icon("loader", "spin"), h("p", {}, "Loading…"))));
  let data;
  try {
    data = await api.bootstrap();
  } catch (e) {
    put(document.getElementById("stage"), h("div", { class: "canvas-wrap" }, h("div", { class: "empty" }, h("h3", {}, "Cannot reach the Wire Studio server"), h("p", {}, e.message))));
    return;
  }
  S.schema = data.schema;
  S.forms = data.forms || {};
  S.assignments = data.assignments || {};
  S.jobs = data.jobs || [];
  applyInventory(data);
  S.family = S.schema.families[data.settings.family] ? data.settings.family : "anima";
  S.task = famSchema().tasks[data.settings.task] ? data.settings.task : "generate";
  for (const j of S.jobs) if (j.status === "done") S.view[`${j.family}/${j.task}`] ||= { jobId: j.id, index: 0, mode: "result" };
  renderAll();
  connectEvents();
  if (!S.connection.ok) setup();
  else if (data.stale) api.refresh().then((d) => (applyInventory(d), renderAll())).catch(() => {});
}
start();
