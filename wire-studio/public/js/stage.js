// Centre stage: the input (with mask painter / outpaint preview), live progress, results.
import { h, put, icon, fmtTime } from "./ui.js";
import { viewUrl, thumb } from "./api.js";
import { S, key, values, taskSchema, taskMeta, famSchema, jobById, isActive, emit } from "./state.js";
import { imageSrc, withUpload, pickFile } from "./form.js";

const primaryField = () => (taskSchema().fields || []).find((f) => f.type === "image");
const stageView = () => (S.view[key()] ||= { jobId: null, index: 0, mode: "input" });

// ---------- fitting images to the canvas ----------
// Every stage image is sized in pixels to the canvas box (scaled up to 4× for small previews),
// which renders the same in Safari, Chrome and Firefox.
function fit(el) {
  const frame = el.closest(".frame");
  const w = Number(el.dataset.w) || el.naturalWidth, hgt = Number(el.dataset.h) || el.naturalHeight;
  if (!frame || !w || !hgt || !frame.clientWidth || !frame.clientHeight) return;
  const k = Math.min(frame.clientWidth / w, frame.clientHeight / hgt, 4);
  el.style.width = Math.max(1, Math.floor(w * k)) + "px";
  el.style.height = Math.max(1, Math.floor(hgt * k)) + "px";
  if (el.classList.contains("outpaint-frame")) {
    const inner = el.firstElementChild;
    Object.assign(inner.style, { left: el.dataset.l * k + "px", top: el.dataset.t * k + "px", width: el.dataset.iw * k + "px", height: el.dataset.ih * k + "px" });
  }
}
const fitAll = () => document.querySelectorAll("#stage .fit").forEach(fit);
const fitImg = (attrs) => h("img", { ...attrs, class: ((attrs.class || "") + " fit").trim(), onload: (e) => (attrs.onload?.(e), fit(e.target)) });
if (typeof ResizeObserver !== "undefined") new ResizeObserver(fitAll).observe(document.getElementById("stage"));

// ---------- mask painter ----------
function maskFor(img) {
  let m = S.masks.get(img.name);
  if (!m) {
    const canvas = document.createElement("canvas");
    canvas.width = img.w;
    canvas.height = img.h;
    m = { canvas, undo: [], painted: false, size: Math.round(Math.max(img.w, img.h) / 18), erase: false };
    S.masks.set(img.name, m);
  }
  return m;
}
export function maskHasPaint(img) {
  return !!(img && S.masks.get(img.name)?.painted);
}
// White = redraw, black = keep, at the image's own resolution.
export function exportMask(img) {
  const m = S.masks.get(img.name);
  const tmp = document.createElement("canvas");
  tmp.width = img.w;
  tmp.height = img.h;
  const t = tmp.getContext("2d");
  t.drawImage(m.canvas, 0, 0);
  t.globalCompositeOperation = "source-in";
  t.fillStyle = "#fff";
  t.fillRect(0, 0, img.w, img.h);
  const out = document.createElement("canvas");
  out.width = img.w;
  out.height = img.h;
  const o = out.getContext("2d");
  o.fillStyle = "#000";
  o.fillRect(0, 0, img.w, img.h);
  o.drawImage(tmp, 0, 0);
  return new Promise((r) => out.toBlob(r, "image/png"));
}
function painted(m) {
  const ctx = m.canvas.getContext("2d", { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, m.canvas.width, m.canvas.height).data;
  for (let i = 3; i < d.length; i += 64) if (d[i]) return true;
  return false;
}
function painter(img) {
  const m = maskFor(img);
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#a78bfa";
  const base = fitImg({ src: imageSrc(img), alt: "Image to inpaint", draggable: "false" });
  const wrap = h("div", { class: "painter checker" }, base, m.canvas);
  m.canvas.className = "mask";
  const cursor = h("div", { class: "cursor", hidden: true });
  wrap.append(cursor);
  const ctx = m.canvas.getContext("2d", { willReadFrequently: true });
  let drawing = false, last = null;
  const scale = () => m.canvas.width / wrap.getBoundingClientRect().width;
  const point = (e) => {
    const r = wrap.getBoundingClientRect();
    return { x: (e.clientX - r.left) * scale(), y: (e.clientY - r.top) * scale(), cx: e.clientX - r.left, cy: e.clientY - r.top };
  };
  const stroke = (a, b) => {
    ctx.globalCompositeOperation = m.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = m.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  wrap.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    wrap.setPointerCapture(e.pointerId);
    m.undo.push(ctx.getImageData(0, 0, m.canvas.width, m.canvas.height));
    if (m.undo.length > 12) m.undo.shift();
    drawing = true;
    last = point(e);
    stroke(last, { x: last.x + 0.01, y: last.y });
  });
  wrap.addEventListener("pointermove", (e) => {
    const p = point(e);
    cursor.hidden = false;
    const d = m.size / scale();
    Object.assign(cursor.style, { left: p.cx + "px", top: p.cy + "px", width: d + "px", height: d + "px" });
    if (!drawing) return;
    stroke(last, p);
    last = p;
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    const was = m.painted;
    m.painted = painted(m);
    if (was !== m.painted) emit("mask");
  };
  wrap.addEventListener("pointerup", end);
  wrap.addEventListener("pointercancel", end);
  wrap.addEventListener("pointerleave", () => (cursor.hidden = true));
  return wrap;
}
function maskTools(img) {
  const m = maskFor(img);
  const ctx = m.canvas.getContext("2d");
  const size = h("input", { type: "range", min: 4, max: Math.round(Math.max(img.w, img.h) / 4), value: m.size, "aria-label": "Brush size", oninput: (e) => (m.size = Number(e.target.value)) });
  const mode = (erase) => h("button", { "aria-pressed": String(m.erase === erase), onclick: () => ((m.erase = erase), renderStage()) }, icon(erase ? "eraser" : "brush"), erase ? "Erase" : "Brush");
  const after = () => {
    m.painted = painted(m);
    emit("mask");
  };
  return h(
    "div",
    { class: "tools" },
    h("div", { class: "seg" }, mode(false), mode(true)),
    h("span", { class: "faint" }, "Size"),
    size,
    h("button", { class: "icon-btn small", title: "Undo (Ctrl+Z)", "aria-label": "Undo", onclick: () => m.undo.length && (ctx.putImageData(m.undo.pop(), 0, 0), after()) }, icon("undo")),
    h("button", {
      class: "icon-btn small", title: "Invert", "aria-label": "Invert mask",
      onclick: () => {
        m.undo.push(ctx.getImageData(0, 0, img.w, img.h));
        const copy = document.createElement("canvas");
        copy.width = img.w;
        copy.height = img.h;
        copy.getContext("2d").drawImage(m.canvas, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
        ctx.fillRect(0, 0, img.w, img.h);
        ctx.globalCompositeOperation = "destination-out";
        ctx.drawImage(copy, 0, 0);
        after();
      },
    }, icon("invert")),
    h("button", { class: "btn small", onclick: () => (m.undo.push(ctx.getImageData(0, 0, img.w, img.h)), ctx.clearRect(0, 0, img.w, img.h), after()) }, "Clear"),
  );
}
export function undoMask() {
  const img = values()[primaryField()?.key];
  const m = img && S.masks.get(img.name);
  if (!m?.undo.length) return;
  m.canvas.getContext("2d").putImageData(m.undo.pop(), 0, 0);
  m.painted = painted(m);
  emit("mask");
}

// ---------- outpaint preview ----------
function outpaintPreview(img, v) {
  const W = img.w + (v.left || 0) + (v.right || 0), H = img.h + (v.top || 0) + (v.bottom || 0);
  const box = h("div", { class: "outpaint-frame fit", "data-w": W, "data-h": H, "data-l": v.left || 0, "data-t": v.top || 0, "data-iw": img.w, "data-ih": img.h });
  box.append(h("img", { src: imageSrc(img), alt: "Image to extend" }));
  return box;
}

// ---------- compare / results ----------
function compare(before, after) {
  const el = h("div", { class: "compare checker" }, fitImg({ src: before, alt: "Before" }), h("img", { class: "after", src: after, alt: "After" }), h("div", { class: "handle" }), h("span", { class: "tag", style: { left: "8px" } }, "Before"), h("span", { class: "tag", style: { right: "8px" } }, "After"));
  const move = (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--cut", Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)) + "%");
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerdown", move);
  return el;
}
const inputOf = (job) => {
  const img = job?.params?.image;
  return img && typeof img === "string" ? viewUrl({ filename: img.split("/").pop(), subfolder: img.split("/").slice(0, -1).join("/"), type: "input" }) : null;
};

function progressCard(job) {
  const p = job.progress;
  const pct = p?.max ? Math.round((p.value / p.max) * 100) : null;
  const label = job.status === "queued" ? (job.position ? `Waiting in queue · position ${job.position}` : "Queued") : p?.max ? `Step ${p.value} of ${p.max}` : "Running…";
  return h(
    "div",
    { class: "progress-card", "data-progress": job.id },
    h("div", { class: "row" }, icon("loader", "spin"), h("b", { "data-label": "" }, label), h("span", { class: "spacer", style: { flex: 1 } }), h("button", { class: "btn small", onclick: () => emit("cancel", job.id) }, "Cancel")),
    h("div", { class: "bar" + (pct === null ? " indeterminate" : "") }, h("i", { style: pct === null ? {} : { width: pct + "%" } })),
  );
}
export function updateProgress(job) {
  const card = document.querySelector(`[data-progress="${job.id}"]`);
  if (!card) return;
  const p = job.progress;
  const bar = card.querySelector(".bar");
  if (p?.max) {
    bar.classList.remove("indeterminate");
    bar.firstChild.style.width = Math.round((p.value / p.max) * 100) + "%";
    card.querySelector("[data-label]").textContent = `Step ${p.value} of ${p.max}`;
  }
}
export function updatePreview(id) {
  const img = document.querySelector(`[data-preview="${id}"]`);
  if (img) img.src = `/api/jobs/${id}/preview?t=${Date.now()}`;
}

function resultView(job, v) {
  if (job.status === "error")
    return h("div", { class: "empty" }, h("div", { class: "big", style: { color: "var(--bad)" } }, icon("alert")), h("h3", {}, "This run failed"), h("p", { class: "mono", style: { whiteSpace: "pre-wrap" } }, job.error || "ComfyUI reported an error"));
  if (job.status === "cancelled") return h("div", { class: "empty" }, h("div", { class: "big" }, icon("x")), h("h3", {}, "Cancelled"));
  const images = job.images || [];
  if (images.length > 1)
    return h(
      "div",
      { class: "result-grid", style: { gridTemplateRows: `repeat(${Math.ceil(images.length / 2)}, minmax(0, 1fr))` } },
      images.map((im, i) => h("div", { class: "cell" }, h("img", { src: viewUrl(im), alt: `Result ${i + 1}`, onclick: () => emit("lightbox", { job, index: i }) }))),
    );
  const im = images[0];
  if (!im) return h("div", { class: "empty" }, h("h3", {}, "No image was saved"));
  const before = inputOf(job);
  const src = viewUrl(im);
  if (before && ["img2img", "inpaint", "face", "hands", "faceswap", "edit", "upscale"].includes(job.task)) return compare(before, src);
  return fitImg({ src, alt: "Result", class: "checker", style: { cursor: "zoom-in" }, onclick: () => emit("lightbox", { job, index: 0 }) });
}

function emptyState(fld) {
  const meta = taskMeta();
  const off = taskSchema().unavailable;
  if (off)
    return h(
      "div",
      { class: "empty" },
      h("div", { class: "big" }, icon(meta.icon)),
      h("h3", {}, `${meta.label} is not offered for ${famSchema().label}`),
      h("p", {}, off),
      famSchema().tasks.face && !famSchema().tasks.face.unavailable ? h("div", { class: "chips", style: { justifyContent: "center", marginTop: "12px" } }, h("button", { class: "btn", onclick: () => emit("goto", { task: "face" }) }, icon("face"), "Open Face Fix")) : null,
    );
  if (!fld) {
    return h(
      "div",
      { class: "empty" },
      h("div", { class: "big" }, icon(meta.icon)),
      h("h3", {}, `${famSchema().label} · ${meta.label}`),
      h("p", {}, meta.about),
      h("p", { class: "faint" }, famSchema().promptStyle),
    );
  }
  const drop = h(
    "div",
    { class: "empty drop-hint" },
    h("div", { class: "big" }, icon("upload")),
    h("h3", {}, `Add ${fld.label.toLowerCase()}`),
    h("p", {}, "Drop an image here, paste with Ctrl+V, or"),
    h("div", { class: "chips", style: { justifyContent: "center", marginTop: "10px" } }, h("button", { class: "btn", onclick: async () => load(fld.key, await pickFile()) }, icon("upload"), "Upload"), h("button", { class: "btn", onclick: () => emit("pick-image", { field: fld.key }) }, icon("gallery"), "From results")),
  );
  drop.addEventListener("dragover", (e) => (e.preventDefault(), drop.classList.add("over")));
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    load(fld.key, e.dataTransfer.files?.[0]);
  });
  return drop;
}
const load = (fieldKey, file) => withUpload(fieldKey, file);

function filmstrip() {
  const jobs = S.jobs.filter((j) => j.family === S.family && j.task === S.task).slice(0, 40);
  const sv = stageView();
  if (!jobs.length) return h("div", { class: "strip" }, h("span", { class: "label" }, "Results of this task will appear here."));
  return h(
    "div",
    { class: "strip", role: "list" },
    h("span", { class: "label" }, "Recent"),
    jobs.map((j) =>
      h(
        "button",
        {
          class: "thumb" + (j.status === "error" ? " failed" : ""),
          role: "listitem",
          title: `${j.params?.prompt || taskMeta(j.task).label} · ${fmtTime(j.created)}`,
          "aria-current": String(sv.jobId === j.id && sv.mode === "result"),
          onclick: () => {
            Object.assign(sv, { jobId: j.id, index: 0, mode: "result" });
            renderStage();
          },
        },
        j.images?.[0] ? h("img", { src: thumb(j.images[0]), alt: "", loading: "lazy" }) : isActive(j) ? icon("loader", "spin") : icon(j.status === "error" ? "alert" : "x"),
      ),
    ),
  );
}

export function renderStage() {
  const stage = document.getElementById("stage");
  const t = taskSchema();
  const meta = taskMeta();
  const v = values();
  const fld = primaryField();
  const img = fld ? v[fld.key] : null;
  const sv = stageView();
  const job = sv.jobId && jobById(sv.jobId);
  const showResult = sv.mode === "result" && job;

  const actions = [];
  if (showResult && job.images?.length)
    actions.push(
      h("button", { class: "btn small", onclick: (e) => emit("use-as", { anchor: e.currentTarget, job, index: sv.index || 0 }) }, icon("layers"), "Use as input"),
      h("a", { class: "btn small", href: viewUrl(job.images[sv.index || 0]), download: job.images[sv.index || 0].filename }, icon("download"), "Download"),
      h("button", { class: "icon-btn small", title: "Open full screen", "aria-label": "Open full screen", onclick: () => emit("lightbox", { job, index: sv.index || 0 }) }, icon("expand")),
    );
  if (showResult && fld) actions.push(h("button", { class: "btn small", onclick: () => ((sv.mode = "input"), renderStage()) }, icon("left"), "Back to input"));
  if (!showResult && job && job.status === "done") actions.push(h("button", { class: "btn small", onclick: () => ((sv.mode = "result"), renderStage()) }, "Show last result", icon("right")));
  if (!showResult && S.task === "inpaint" && img) actions.unshift(maskTools(img));

  const title = showResult ? h("h2", {}, job.status === "done" ? "Result" : isActive(job) ? "Working…" : "Run", h("span", { class: "faint", style: { fontWeight: 400 } }, `  ·  seed ${job.seed ?? "–"}  ·  ${fmtTime(job.created)}`)) : h("h2", {}, img ? fld.label : meta.label);
  const head = h("div", { class: "stage-head" }, title, h("div", { class: "spacer" }), actions);

  const canvas = h("div", { class: "canvas-wrap" });
  let content;
  if (showResult && !isActive(job)) content = resultView(job, v);
  else if (showResult && isActive(job)) {
    const base = inputOf(job);
    content = base ? fitImg({ src: base, alt: "", style: { opacity: 0.35 } }) : h("div", { class: "empty" }, h("div", { class: "big" }, icon(meta.icon)), h("h3", {}, "Generating"));
    canvas.append(
      h("div", { class: "live-preview" }, h("img", { "data-preview": job.id, alt: "", onerror: (e) => (e.target.style.visibility = "hidden"), onload: (e) => ((e.target.style.visibility = "visible"), canvas.classList.add("has-preview")), style: { visibility: "hidden" } })),
      progressCard(job),
    );
  } else if (img && S.task === "inpaint") content = painter(img);
  else if (img && S.task === "outpaint") content = outpaintPreview(img, v);
  else if (img) content = fitImg({ src: imageSrc(img), alt: fld.label, class: "checker" });
  else content = emptyState(fld && !fld.optional ? fld : null);
  canvas.prepend(h("div", { class: "frame" }, content));
  put(stage, head, canvas, filmstrip());
  requestAnimationFrame(fitAll);
  if (showResult && isActive(job) && job.hasPreview) updatePreview(job.id);
}

// After a run starts (or finishes) show it on the stage of its own task.
export function focusJob(job) {
  const k = `${job.family}/${job.task}`;
  S.view[k] = { jobId: job.id, index: 0, mode: "result" };
}
export { primaryField };
