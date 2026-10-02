// Overlays: lightbox viewer, gallery, setup (connection · readiness · library), queue, picker.
import { h, put, icon, fmtTime, shortName, copyText, menu } from "./ui.js";
import { api, viewUrl, thumb } from "./api.js";
import { S, taskMeta, isActive, emit, upsertJob } from "./state.js";
import { needList } from "./form.js";

const overlay = () => document.getElementById("overlay");
export function closeOverlay() {
  overlay().hidden = true;
  put(overlay());
  document.querySelector(".lightbox")?.remove();
}
function sheet(title, tools, body) {
  const el = h(
    "div",
    { class: "sheet", role: "dialog", "aria-label": title },
    h("div", { class: "sheet-head" }, h("h2", {}, title), h("div", { class: "spacer" }), tools, h("button", { class: "icon-btn", "aria-label": "Close", onclick: closeOverlay }, icon("x"))),
    h("div", { class: "sheet-body" }, body),
  );
  put(overlay(), el);
  overlay().hidden = false;
  overlay().onclick = (e) => e.target === overlay() && closeOverlay();
  return el;
}
const famLabel = (f) => (f === "utility" ? "Tools" : S.schema.families[f]?.label || f);
const taskLabel = (t) => S.schema.tasks[t]?.label || (t === "remove-bg" ? "Remove background" : t === "map" ? "Control map" : t);

// ---------- lightbox ----------
export function lightbox(items, index = 0) {
  document.querySelector(".lightbox")?.remove();
  let i = index;
  const lb = h("div", { class: "lightbox", role: "dialog", "aria-label": "Image viewer" });
  const draw = () => {
    const { job, image } = items[i];
    const p = job.params || {};
    put(lb, 
      h(
        "div",
        { class: "bar-top" },
        h("span", {}, `${famLabel(job.family)} · ${taskLabel(job.task)}`),
        h("span", { class: "faint" }, `  ${i + 1} / ${items.length}`),
        h("div", { class: "spacer" }),
        h("button", { class: "ghost", onclick: async () => { const r = await api.star(job.id, !job.starred); upsertJob(r.job); Object.assign(job, r.job); draw(); } }, icon("star"), job.starred ? "Starred" : "Star"),
        h("button", { class: "ghost", onclick: (e) => emit("use-as", { anchor: e.currentTarget, job, index: job.images.indexOf(image) }) }, icon("layers"), "Use as input"),
        h("button", { class: "ghost", onclick: () => (closeOverlay(), emit("restore", job)) }, icon("refresh"), "Reuse settings"),
        h("a", { class: "ghost", href: `/api/jobs/${job.id}/workflow`, download: "" }, icon("code"), "Workflow"),
        h("a", { class: "ghost", href: viewUrl(image), download: image.filename }, icon("download"), "Download"),
        h("button", { class: "icon-btn", "aria-label": "Close viewer", onclick: () => lb.remove() }, icon("x")),
      ),
      h(
        "div",
        { class: "view" },
        h("img", { src: viewUrl(image), alt: p.prompt || "Result" }),
        items.length > 1 ? h("button", { class: "icon-btn nav prev", "aria-label": "Previous", onclick: () => go(-1) }, icon("left")) : null,
        items.length > 1 ? h("button", { class: "icon-btn nav next", "aria-label": "Next", onclick: () => go(1) }, icon("right")) : null,
      ),
      h(
        "div",
        { class: "info" },
        p.prompt ? h("div", { class: "prompt" }, p.prompt) : null,
        h("span", {}, "Seed ", h("b", { class: "copy", onclick: () => copyText(String(job.seed)) }, String(job.seed ?? "–"))),
        p.model ? h("span", {}, "Model ", h("b", {}, shortName(p.model))) : null,
        p.steps ? h("span", {}, `${p.steps} steps · CFG ${p.cfg} · ${p.sampler}`) : null,
        (p.loras || []).filter((l) => l.on !== false).length ? h("span", {}, "LoRAs ", h("b", {}, p.loras.filter((l) => l.on !== false).map((l) => `${shortName(l.name)} ${l.strength}`).join(", "))) : null,
        h("span", { class: "faint" }, fmtTime(job.created)),
      ),
    );
  };
  const go = (d) => {
    i = (i + d + items.length) % items.length;
    draw();
  };
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
    if (e.key === "Escape") lb.remove();
  });
  lb.tabIndex = -1;
  draw();
  document.body.append(lb);
  lb.focus();
}
export const flatten = (jobs) => jobs.flatMap((job) => (job.images || []).map((image) => ({ job, image })));

// ---------- gallery ----------
const G = { family: "", task: "", starred: false, jobs: null, more: true };
export async function gallery() {
  if (!G.jobs) {
    G.jobs = S.jobs.filter((j) => j.status === "done");
    G.more = true;
  }
  const filtered = () => G.jobs.filter((j) => (!G.family || j.family === G.family) && (!G.task || j.task === G.task) && (!G.starred || j.starred));
  const grid = h("div", { class: "gallery-grid" });
  const drawGrid = () => {
    const items = flatten(filtered());
    put(grid, 
      ...(items.length
        ? items.map((it, i) =>
            h(
              "button",
              { onclick: () => lightbox(items, i), "aria-label": it.job.params?.prompt || taskLabel(it.job.task) },
              h("img", { src: thumb(it.image), alt: "", loading: "lazy" }),
              h("span", { class: "tag" }, `${famLabel(it.job.family)} · ${taskLabel(it.job.task)}`),
              it.job.starred ? h("span", { class: "star" }, icon("star")) : null,
            ),
          )
        : [h("div", { class: "faint" }, "Nothing here yet.")]),
    );
  };
  const chip = (label, on, fn) => h("button", { class: "chip", "aria-pressed": String(on), onclick: () => (fn(), gallery()) }, label);
  const tools = h(
    "div",
    { class: "gallery-tools" },
    chip("All", !G.family, () => (G.family = "")),
    S.schema.order.map((f) => chip(famLabel(f), G.family === f, () => (G.family = f))),
    h("select", { "aria-label": "Task", style: { width: "auto" }, onchange: (e) => ((G.task = e.target.value), drawGrid()) }, h("option", { value: "" }, "All tasks"), Object.entries(S.schema.tasks).map(([k, t]) => h("option", { value: k, selected: G.task === k }, t.label))),
    chip("★ Starred", G.starred, () => (G.starred = !G.starred)),
  );
  const more = h("button", { class: "btn", onclick: loadMore }, "Load older");
  async function loadMore() {
    const oldest = G.jobs.at(-1)?.created || Date.now();
    const { jobs } = await api.jobs({ limit: 120, before: oldest });
    const fresh = jobs.filter((j) => j.status === "done" && !G.jobs.some((x) => x.id === j.id));
    G.jobs.push(...fresh);
    if (jobs.length < 120) (G.more = false), more.remove();
    drawGrid();
  }
  sheet("Gallery", null, [tools, grid, G.more ? h("div", { style: { textAlign: "center" } }, more) : null]);
  drawGrid();
}
export function invalidateGallery() {
  G.jobs = null;
}

// ---------- image picker (results → input) ----------
export function pickResult(onPick) {
  const items = flatten(S.jobs.filter((j) => j.status === "done")).slice(0, 200);
  sheet(
    "Choose a result",
    null,
    items.length
      ? h("div", { class: "gallery-grid" }, items.map((it) => h("button", { onclick: () => (closeOverlay(), onPick(it)) }, h("img", { src: thumb(it.image), alt: "", loading: "lazy" }), h("span", { class: "tag" }, `${famLabel(it.job.family)} · ${taskLabel(it.job.task)}`))))
      : h("div", { class: "faint" }, "No results yet. Generate something first, or upload an image."),
  );
}

// ---------- setup ----------
let selected = null;
export function setup(focus = {}) {
  if (focus.family && focus.task) selected = { family: focus.family, task: focus.task };
  const c = S.connection;
  const url = h("input", { type: "url", value: c.url || "http://127.0.0.1:8188", "aria-label": "ComfyUI address", placeholder: "http://127.0.0.1:8188" });
  const connect = h("button", { class: "btn primary", onclick: () => emit("connect", url.value) }, icon("plug"), c.ok ? "Reconnect" : "Connect");
  url.addEventListener("keydown", (e) => e.key === "Enter" && connect.click());
  const status = c.ok
    ? h("div", { class: "kv" }, h("span", {}, h("span", { class: "status-dot ok", style: { display: "inline-block", marginRight: "6px" } }), h("b", {}, "Connected")), c.version ? h("span", {}, "ComfyUI ", h("b", {}, c.version)) : null, c.gpu ? h("span", {}, "GPU ", h("b", {}, c.gpu.name), c.gpu.vram ? ` · ${(c.gpu.vram / 2 ** 30).toFixed(0)} GB` : "") : null, h("span", {}, "Live progress ", h("b", {}, c.live ? "on" : "polling")))
    : h("div", { class: "notice bad" }, icon("plug"), h("span", {}, c.error || "Not connected. Start ComfyUI, then enter its address (the one you open in the browser)."));

  const r = S.readiness;
  const families = S.schema.order;
  const matrix = r
    ? h(
        "table",
        { class: "matrix" },
        h("thead", {}, h("tr", {}, h("th", {}, "Task"), families.map((f) => h("th", { style: { textAlign: "center" } }, famLabel(f))))),
        h(
          "tbody",
          {},
          Object.keys(S.schema.tasks).map((t) =>
            h(
              "tr",
              {},
              h("td", {}, taskLabel(t)),
              families.map((f) => {
                const cell = r[f]?.[t];
                if (!cell) return h("td", { class: "cell faint" }, "—");
                const label = { ready: "Ready", limited: "Ready*", missing: "Needs setup", off: "Not offered" }[cell.state];
                const sel = selected?.family === f && selected?.task === t;
                return h("td", { class: "cell" }, h("button", { class: `state ${cell.state}${sel ? " sel" : ""}`, onclick: () => ((selected = { family: f, task: t }), setup()) }, icon(cell.state === "ready" ? "check" : cell.state === "missing" ? "x" : cell.state === "off" ? "x" : "alert"), label));
              }),
            ),
          ),
        ),
      )
    : h("div", { class: "faint" }, "Connect to see what is ready.");

  let detail = null;
  if (r && selected) {
    const cell = r[selected.family]?.[selected.task];
    if (cell)
      detail = h(
        "div",
        { class: "card" },
        h("h3", {}, `${famLabel(selected.family)} · ${taskLabel(selected.task)}`),
        cell.state === "off" ? h("div", { class: "muted" }, cell.reason) : cell.items.length ? needList(cell.items) : h("div", { class: "muted" }, "Nothing extra needed."),
        h("div", { class: "chips" }, cell.state !== "off" ? h("button", { class: "btn small", onclick: () => (closeOverlay(), emit("goto", selected)) }, "Open this task", icon("right")) : null),
      );
  }

  const inv = S.inventory;
  const unsorted = inv ? [...(inv.unsortedModels || []).map((n) => ({ n, kind: "model" })), ...(inv.unsortedLoras || []).map((n) => ({ n, kind: "LoRA" }))] : [];
  const assigned = Object.entries(S.assignments || {});
  const library = h(
    "div",
    { class: "card", id: "library" },
    h("h3", {}, icon("layers"), "Library"),
    h("div", { class: "muted" }, "Files are sorted into families by their folder (loras/SDXL/…, diffusion_models/z-image/turbo/…, any depth), else by file name. A turbo/ or regular/ folder sets the sampling preset. Anything unclear is listed here so it is never mixed into the wrong workflow."),
    h("div", { class: "chips" }, h("a", { class: "btn small", href: "/guide", target: "_blank", rel: "noreferrer" }, icon("info"), "ComfyUI models guide")),
    inv
      ? h(
          "div",
          { class: "kv" },
          families.map((f) => {
            const fam = inv.families[f] || {};
            const turbo = Object.values(fam.variants || {}).filter((x) => x === "turbo").length;
            return h("span", {}, famLabel(f), ": ", h("b", {}, `${fam.models?.length || 0} models`), turbo ? ` (${turbo} turbo)` : "", ` · ${fam.loras?.length || 0} LoRAs`);
          }),
        )
      : null,
    inv?.misplaced?.length
      ? h(
          "div",
          { class: "notice warn" },
          icon("alert"),
          h("div", {}, h("b", {}, "These files cannot be loaded where they are"), h("div", {}, "Anima, Z-Image and Krea 2 models are diffusion models; ComfyUI only loads them from models/diffusion_models (or models/unet)."), inv.misplaced.map((m) => h("div", { class: "mono" }, `models/${m.folder}/${m.name}  →  models/${m.should}/${m.name}`))),
        )
      : null,
    unsorted.length
      ? h(
          "table",
          { class: "matrix" },
          h("tbody", {}, unsorted.map(({ n, kind }) => h("tr", {}, h("td", { class: "mono" }, n), h("td", { class: "faint" }, kind), h("td", {}, assignSelect(n, ""))))),
        )
      : h("div", { class: "faint" }, "No unsorted files."),
    assigned.length ? h("details", { class: "advanced" }, h("summary", {}, `Your assignments (${assigned.length})`), h("div", { class: "inner" }, h("table", { class: "matrix" }, h("tbody", {}, assigned.map(([n, f]) => h("tr", {}, h("td", { class: "mono" }, n), h("td", {}, assignSelect(n, f)))))))) : null,
  );

  const theme = document.documentElement.dataset.theme === "light";
  sheet(
    "Setup",
    [
      h("button", { class: "btn small", onclick: () => emit("refresh") }, icon("refresh"), "Re-check"),
      h("button", { class: "btn small", "aria-label": "Toggle light or dark theme", onclick: () => emit("theme") }, icon(theme ? "moon" : "sun"), theme ? "Dark" : "Light"),
    ],
    [
      h("div", { class: "card" }, h("h3", {}, icon("plug"), "ComfyUI connection"), h("div", { class: "conn-row" }, url, connect), status),
      h("div", { class: "card" }, h("h3", {}, icon("grid"), "What is ready", S.stale ? h("span", { class: "badge warn" }, "cached") : null), h("div", { class: "muted" }, "Every family has its own workflows. Select a cell to see exactly which nodes and model files it uses and where to get anything missing."), matrix),
      detail,
      library,
    ],
  );
  if (focus.tab === "library") document.getElementById("library")?.scrollIntoView();
}
function assignSelect(name, current) {
  const sel = h(
    "select",
    { "aria-label": "Family for " + name, style: { width: "auto" }, onchange: (e) => emit("assign", { name, family: e.target.value }) },
    h("option", { value: "" }, current ? "Remove assignment" : "Assign to…"),
    S.schema.order.map((f) => h("option", { value: f, selected: f === current }, famLabel(f))),
  );
  return sel;
}

// ---------- queue popover ----------
export function renderQueue() {
  const q = document.getElementById("queue");
  if (q.hidden) return;
  const active = S.jobs.filter(isActive);
  const recent = S.jobs.filter((j) => !isActive(j)).slice(0, 12);
  const item = (j) => {
    const p = j.progress;
    const sub = isActive(j) ? (j.status === "queued" ? (j.position ? `Queued · #${j.position}` : "Queued") : p?.max ? `Step ${p.value}/${p.max}` : "Running") : j.status === "error" ? null : j.status === "cancelled" ? "Cancelled" : fmtTime(j.finished || j.created);
    return h(
      "div",
      { class: "qitem" },
      h("div", { class: "thumb", style: j.images?.[0] ? { backgroundImage: `url("${thumb(j.images[0])}")` } : {} }, j.images?.[0] ? null : icon(isActive(j) ? "loader" : j.status === "error" ? "alert" : "x", isActive(j) ? "spin" : "")),
      h(
        "div",
        { style: { minWidth: 0, cursor: "pointer" }, onclick: () => (q.hidden = true, emit("goto", { family: j.family, task: j.task, jobId: j.id })) },
        h("div", { class: "t" }, `${famLabel(j.family)} · ${taskLabel(j.task)}`),
        j.status === "error" ? h("div", { class: "s err" }, j.error) : h("div", { class: "s" }, sub),
      ),
      isActive(j) ? h("button", { class: "btn small", onclick: () => emit("cancel", j.id) }, "Cancel") : h("button", { class: "icon-btn small", "aria-label": "Remove from history", onclick: () => emit("remove", j.id) }, icon("trash")),
    );
  };
  put(q, 
    active.length ? h("div", { class: "group-title" }, "Running") : null,
    ...active.map(item),
    h("div", { class: "group-title" }, "Recent"),
    ...(recent.length ? recent.map(item) : [h("div", { class: "empty-q" }, "No runs yet.")]),
  );
}

export function useAsMenu(anchor, job, index, onChoose) {
  const fam = S.schema.families[job.family] || S.schema.families[S.family];
  const famId = S.schema.families[job.family] ? job.family : S.family;
  const targets = Object.entries(fam.tasks)
    .filter(([, t]) => !t.unavailable && t.fields.some((f) => f.type === "image"))
    .map(([taskId]) => ({ label: taskLabel(taskId), icon: taskMeta(taskId).icon, onClick: () => onChoose({ family: famId, task: taskId, job, index }) }));
  menu(anchor, [{ head: `${fam.label} tasks` }, ...targets, "-", { label: "Remove background", icon: "scissors", onClick: () => onChoose({ utility: "remove-bg", job, index }) }]);
}
