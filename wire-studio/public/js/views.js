// Overlays: lightbox viewer, gallery, setup (connection · readiness · library), queue, picker.
import { h, put, icon, fmtTime, shortName, copyText, menu } from "./ui.js";
import { api, viewUrl, thumb } from "./api.js";
import { S, taskMeta, isActive, emit, upsertJob } from "./state.js";
import { needList, foundFiles, imageSrc } from "./form.js";

const overlay = () => document.getElementById("overlay");
export function closeOverlay() {
  overlay().hidden = true;
  put(overlay());
  document.querySelector(".lightbox")?.remove();
}
function sheet(title, tools, body) {
  // Re-drawing the same sheet (a tab, a matrix cell) keeps its scroll position.
  const open = !overlay().hidden && overlay().querySelector(".sheet")?.getAttribute("aria-label") === title;
  const scroll = open ? overlay().querySelector(".sheet-body")?.scrollTop || 0 : 0;
  const el = h(
    "div",
    { class: "sheet", role: "dialog", "aria-label": title },
    h("div", { class: "sheet-head" }, h("h2", {}, title), h("div", { class: "spacer" }), tools, h("button", { class: "icon-btn", "aria-label": "Close", onclick: closeOverlay }, icon("x"))),
    h("div", { class: "sheet-body" }, body),
  );
  put(overlay(), el);
  overlay().hidden = false;
  if (scroll) el.querySelector(".sheet-body").scrollTop = scroll;
  // (A handler that returns false cancels the click, so never return the comparison.)
  overlay().onclick = (e) => {
    if (e.target === overlay()) closeOverlay();
  };
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
        "div",
        { class: "table-scroll" },
        h(
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
        cell.state === "off" ? h("div", { class: "muted" }, cell.reason) : cell.items.length ? needList(cell.items, { family: selected.family }) : h("div", { class: "muted" }, "Nothing extra needed."),
        h("div", { class: "chips" }, cell.state !== "off" ? h("button", { class: "btn small", onclick: () => (closeOverlay(), emit("goto", selected)) }, "Open this task", icon("right")) : null),
      );
  }

  const inv = S.inventory;
  const unsorted = inv ? [...(inv.unsortedModels || []).map((n) => ({ n, kind: "model" })), ...(inv.unsortedLoras || []).map((n) => ({ n, kind: "LoRA" }))] : [];
  const others = inv ? [...(inv.otherModels || []).map((n) => ({ n, kind: "model" })), ...(inv.otherLoras || []).map((n) => ({ n, kind: "LoRA" }))] : [];
  const fileTable = (rows, current) => h("div", { class: "table-scroll" }, h("table", { class: "matrix files" }, h("tbody", {}, rows.map(({ n, kind }) => h("tr", {}, h("td", { class: "mono" }, n), h("td", { class: "faint" }, kind), h("td", {}, assignSelect(n, current)))))));
  const assigned = Object.entries(S.assignments || {});
  const library = h(
    "div",
    { class: "card", id: "library" },
    h("h3", {}, icon("layers"), "Library"),
    h("div", { class: "muted" }, "Files are sorted into families by their folder (loras/SDXL/…, diffusion_models/z-image/turbo/…, any depth), else by file name. A turbo/ or regular/ folder sets the sampling preset. Files whose family cannot be told are listed here so they are never mixed into the wrong workflow."),
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
    unsorted.length ? h("div", {}, h("div", { class: "t-sub" }, `Unsorted — pick a family (${unsorted.length})`), fileTable(unsorted, "")) : h("div", { class: "faint" }, "No unsorted files."),
    others.length
      ? h(
          "details",
          { class: "advanced" },
          h("summary", {}, icon("chev", "chev"), `Other model families — not used (${others.length})`),
          h("div", { class: "inner" }, h("div", { class: "muted" }, "FLUX, SD 1.5, Qwen-Image, Wan and other families Wire Studio does not run. They are never offered in a workflow. If one is really an Anima, SDXL, Z-Image or Krea 2 file, assign it."), fileTable(others, "")),
        )
      : null,
    assigned.length ? h("details", { class: "advanced" }, h("summary", {}, `Your assignments (${assigned.length})`), h("div", { class: "inner" }, h("div", { class: "table-scroll" }, h("table", { class: "matrix files" }, h("tbody", {}, assigned.map(([n, f]) => h("tr", {}, h("td", { class: "mono" }, n), h("td", {}, assignSelect(n, f))))))))) : null,
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
      suggestedCard(inv),
      library,
    ],
  );
  if (focus.tab === "library") document.getElementById("library")?.scrollIntoView();
}
// Every suggested model and LoRA per family, its folder, and whether this ComfyUI has it.
const NEED = { required: "Required", recommended: "Recommended", optional: "Optional", alternative: "Alternative", example: "Your files" };
const COUNTED = ["required", "recommended", "optional"];
let suggestTab = null;
let suggestMissing = false;
function suggestedCard(inv) {
  const list = inv?.suggested;
  const head = h("h3", {}, icon("download"), "Suggested models & LoRAs");
  const guide = h("a", { class: "btn small", href: "/guide", target: "_blank", rel: "noreferrer" }, icon("info"), "Full guide with folder tree");
  if (!list) return h("div", { class: "card", id: "suggested" }, head, h("div", { class: "muted" }, "Connect to ComfyUI to see which suggested files you already have."), h("div", { class: "chips" }, guide));
  const tabs = [...S.schema.order.map((f) => famLabel(f)), "Shared"];
  const tab = tabs.includes(suggestTab) ? suggestTab : famLabel(S.family);
  const counts = (label) => {
    const rows = list.filter((m) => m.family === label && COUNTED.includes(m.need));
    return `${rows.filter((m) => m.status !== "missing").length}/${rows.length}`;
  };
  const rows = list.filter((m) => m.family === tab && (!suggestMissing || m.status === "missing"));
  const familyId = S.schema.order.find((f) => famLabel(f) === tab);
  const preferred = familyId ? inv.families?.[familyId]?.auto : null;
  const row = (m) => {
    const ok = m.status !== "missing";
    const [ico, cls] = ok ? ["check", "ok"] : m.need === "required" ? ["x", "no"] : m.need === "recommended" ? ["alert", "rec"] : ["download", "faint"];
    const name = m.placeholder ? h("i", {}, m.display || m.file) : h("span", { class: "copy mono", title: "Copy file name", onclick: () => copyText(m.file) }, m.file);
    const note = !m.placeholder && m.display && m.display !== m.file ? (m.display.startsWith(m.file) ? m.display.slice(m.file.length).trim() : m.display) : "";
    const status =
      m.status === "found"
        ? h("span", {}, m.placeholder ? "Yours: " : "Installed: ", foundFiles(m.found, m.path, preferred))
        : m.status === "covered"
          ? h("span", {}, "Using instead: ", foundFiles(m.found, m.path, preferred))
          : h("span", {}, m.need === "example" ? h("span", { class: "faint" }, "None yet") : h("span", { class: "faint" }, "Not installed"), m.url ? h("a", { href: m.url, target: "_blank", rel: "noreferrer", class: "link", style: { marginLeft: "8px" } }, /\/resolve\//.test(m.url) ? "Download" : "Get it", " ↗") : null);
    return h(
      "div",
      { class: "need" },
      icon(ico, cls),
      h(
        "div",
        {},
        h("div", { class: "t" }, name, h("span", { class: `need-tag ${m.need}` }, NEED[m.need])),
        h("div", { class: "d" }, note ? h("span", { class: "faint" }, note) : null, h("span", {}, m.role, " — ", m.tasks), h("span", {}, "Goes in ", h("span", { class: "mono" }, `models/${m.path}/`)), status),
      ),
    );
  };
  return h(
    "div",
    { class: "card", id: "suggested" },
    head,
    h("div", { class: "muted" }, "Every model and LoRA file Wire Studio uses or suggests, the folder it goes in, and whether your ComfyUI has it. Any sub-folder works; the one shown keeps things tidy and sets the family and type."),
    h(
      "div",
      { class: "tabs-row" },
      h("div", { class: "seg", role: "tablist" }, tabs.map((t) => h("button", { role: "tab", "aria-selected": String(t === tab), onclick: () => ((suggestTab = t), setup()) }, t, h("span", { class: "count" }, counts(t))))),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: suggestMissing, onchange: (e) => ((suggestMissing = e.target.checked), setup()) }), "Only missing"),
    ),
    rows.length ? h("div", {}, rows.map(row)) : h("div", { class: "faint" }, suggestMissing ? `Every suggested ${tab} file is installed.` : "Nothing listed."),
    h("div", { class: "chips" }, guide),
  );
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

// ---------- control map generator ----------
// Make a control map from an image with an installed preprocessor (canny is native, always there).
// The map runs as a family-free tool job; its result opens in the viewer, and "Use as input" on it
// hands it to a Control task as a ready-made map.
const MAP_DEFAULTS = { kind: "canny", resolution: 1536, cannyLow: 0.15, cannyHigh: 0.4, invert: false };
export function mapTool(img, { kind } = {}, onRun) {
  const installed = Object.entries(S.schema.controlKinds || {}).filter(([k]) => k === "canny" || S.inventory?.preprocessors?.[k]);
  const longSide = Math.max(img.w || 0, img.h || 0) || 1536;
  const v = { ...MAP_DEFAULTS, kind: installed.some(([k]) => k === kind) ? kind : "canny", resolution: Math.min(1536, Math.max(256, Math.round(longSide / 64) * 64)) };
  const slider = (key, label, min, max, step, fmt = (x) => String(x)) => {
    const out = h("span", { class: "value" }, fmt(v[key]));
    const range = h("input", { type: "range", min, max, step, value: v[key], "aria-label": label, oninput: (e) => ((v[key] = Number(e.target.value)), (out.textContent = fmt(v[key]))) });
    return h("div", { class: "field" }, h("label", {}, label, out), range);
  };
  const canny = h("div", { class: "map-canny" }, slider("cannyLow", "Low threshold", 0.01, 0.99, 0.01), slider("cannyHigh", "High threshold", 0.01, 0.99, 0.01));
  canny.hidden = v.kind !== "canny";
  const select = h(
    "select",
    { "aria-label": "Map type", onchange: (e) => ((v.kind = e.target.value), (canny.hidden = v.kind !== "canny")) },
    installed.map(([k, label]) => h("option", { value: k, selected: k === v.kind }, label)),
  );
  const missing = Object.entries(S.schema.controlKinds || {}).filter(([k]) => !installed.some(([x]) => x === k)).map(([, label]) => label);
  const el = sheet(
    "Make a control map",
    null,
    h(
      "div",
      { class: "card map-tool" },
      h("div", { class: "map-src", style: { backgroundImage: `url("${imageSrc(img, "webp;70")}")` } }),
      h(
        "div",
        { class: "map-form" },
        h("div", { class: "field" }, h("label", {}, "Map type"), select),
        missing.length ? h("div", { class: "hint" }, `Not installed: ${missing.join(", ")} (comfyui_controlnet_aux, or the native Depth Anything 3 model). Setup lists what each needs.`) : null,
        slider("resolution", "Resolution (long side)", 256, 2048, 64, (x) => `${Math.min(x, longSide)} px`),
        canny,
        h("label", { class: "switch" }, h("span", { class: "text" }, "Invert (black lines on white)"), h("input", { type: "checkbox", onchange: (e) => (v.invert = e.target.checked) })),
        h("button", { class: "btn primary", onclick: () => (closeOverlay(), onRun({ ...v })) }, icon("play"), "Make map"),
        h("div", { class: "hint" }, "The map opens when it is ready. Use as input → a Control task takes it as a ready-made map."),
      ),
    ),
  );
  el.classList.add("compact");
}

export function useAsMenu(anchor, job, index, onChoose) {
  const fam = S.schema.families[job.family] || S.schema.families[S.family];
  const famId = S.schema.families[job.family] ? job.family : S.family;
  const targets = Object.entries(fam.tasks)
    .filter(([, t]) => !t.unavailable && t.fields.some((f) => f.type === "image"))
    .map(([taskId]) => ({ label: taskLabel(taskId), icon: taskMeta(taskId).icon, onClick: () => onChoose({ family: famId, task: taskId, job, index }) }));
  menu(anchor, [{ head: `${fam.label} tasks` }, ...targets, "-", { label: "Remove background", icon: "scissors", onClick: () => onChoose({ utility: "remove-bg", job, index }) }, { label: "Make control map…", icon: "grid", onClick: () => onChoose({ utility: "map-tool", job, index }) }]);
}
