// Right-hand panel: the current task's form, drawn from the family's schema.
import { h, put, icon, toast, shortName, copyText } from "./ui.js";
import { api, inputUrl } from "./api.js";
import { S, values, setValue, famSchema, taskSchema, taskMeta, readiness, famInventory, emit } from "./state.js";

const FALLBACK_SAMPLERS = ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_2m_sde", "res_multistep", "er_sde", "uni_pc"];
const FALLBACK_SCHEDULERS = ["simple", "normal", "karras", "exponential", "beta", "sgm_uniform"];
// Same rule as engine/fields.mjs shown(): a key that must be truthy, or { key, is: [values] }.
export const visible = (fld, v) => !fld.when || (typeof fld.when === "string" ? !!v[fld.when] : (fld.when.is || []).includes(v[fld.when.key]));
// A choice that names a runtime feature is offered only when the family reports it installed.
const offered = (c) => !c.feature || !!famInventory().features?.[c.feature];
const fmt = (n, step) => (step >= 1 ? String(Math.round(n)) : Number(n).toFixed(String(step).split(".")[1]?.length || 2));

// ---------- image handling shared with the stage ----------
export async function imageFromFile(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Choose a PNG, JPEG or WebP image");
  const bmp = await createImageBitmap(file);
  const w = bmp.width, hgt = bmp.height;
  bmp.close?.();
  const { name } = await api.upload(file, file.name || "pasted.png");
  S.localUrls.set(name, URL.createObjectURL(file));
  return { name, w, h: hgt };
}
export const imageSrc = (img, preview) => (img ? S.localUrls.get(img.name) || inputUrl(img.name, preview) : "");

export async function setImage(fieldKey, img, { f = S.family, t = S.task } = {}) {
  const v = values(f, t);
  v[fieldKey] = img;
  // Pose / control outputs follow the reference's aspect ratio (about 1 MP, multiples of 64).
  const size = (taskSchema(f, t).fields || []).find((x) => x.type === "size" && x.fromImage);
  if (size && fieldKey === "image" && img) Object.assign(v, matchAspect(img.w, img.h));
  setValue(fieldKey, img, { f, t });
}
export function matchAspect(w, hgt) {
  const k = Math.sqrt((1024 * 1024) / (w * hgt));
  return { width: Math.max(512, Math.min(2048, Math.round((w * k) / 64) * 64)), height: Math.max(512, Math.min(2048, Math.round((hgt * k) / 64) * 64)) };
}
export function pickFile() {
  return new Promise((resolve) => {
    const input = document.getElementById("file-input");
    input.value = "";
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}
export async function withUpload(fieldKey, file) {
  if (!file) return;
  const note = toast("Uploading…", "", 20000);
  try {
    await setImage(fieldKey, await imageFromFile(file));
  } catch (e) {
    toast(e.message, "bad");
  } finally {
    note.remove();
  }
}

// ---------- field renderers ----------
const R = {
  prompt(fld, v) {
    const ta = h("textarea", { class: "prompt", placeholder: fld.placeholder, oninput: (e) => setValue(fld.key, e.target.value, { silent: true }) });
    ta.value = v[fld.key] || "";
    const counter = h("span", { class: "hint" });
    const count = () => (counter.textContent = (ta.value.match(/\S+/g) || []).length + " words");
    ta.addEventListener("input", count);
    count();
    return h(
      "div",
      { class: "field" },
      h("label", {}, h("span", {}, fld.label, fld.optional ? h("span", { class: "hint" }, "  optional") : null), counter),
      ta,
      fld.optional ? null : h("div", { class: "hint" }, famSchema().promptStyle),
    );
  },
  line(fld, v) {
    const inp = h("input", { type: "text", placeholder: fld.placeholder || "", "aria-label": fld.label, oninput: (e) => setValue(fld.key, e.target.value, { silent: true }) });
    inp.value = v[fld.key] ?? "";
    return h("div", { class: "field" }, h("label", {}, fld.label), inp, fld.hint ? h("div", { class: "hint" }, fld.hint) : null);
  },
  text(fld, v) {
    const ta = h("textarea", { rows: 3, oninput: (e) => setValue(fld.key, e.target.value, { silent: true }) });
    ta.value = v[fld.key] ?? "";
    return h("div", { class: "field" }, h("label", {}, fld.label), ta);
  },
  image(fld, v) {
    const img = v[fld.key];
    const slot = h(
      "div",
      { class: "slot" + (img ? " filled" : "") },
      h("div", { class: "preview", style: img ? { backgroundImage: `url("${imageSrc(img, "webp;70")}")` } : {} }, img ? null : icon("image")),
      h(
        "div",
        { class: "info" },
        img ? h("div", { class: "name", title: img.name }, shortName(img.name), h("span", { class: "faint" }, `  ${img.w}×${img.h}`)) : h("div", { class: "hint" }, fld.hint || "Drop an image here"),
        h(
          "div",
          { class: "actions" },
          h("button", { class: "btn small", onclick: async () => withUpload(fld.key, await pickFile()) }, icon("upload"), img ? "Replace" : "Upload"),
          h("button", { class: "btn small", onclick: () => emit("pick-image", { field: fld.key }) }, icon("gallery"), "From results"),
          // Control tasks: preview / make the control map of this image (Control Map Generator).
          img && taskMeta()?.group === "Control" ? h("button", { class: "btn small", onclick: () => emit("map-tool", { img, kind: v.kind }) }, icon("grid"), "Make map") : null,
        ),
      ),
      img ? h("button", { class: "icon-btn small remove", "aria-label": "Remove image", title: "Remove image", onclick: () => setImage(fld.key, null) }, icon("x")) : null,
    );
    slot.addEventListener("dragover", (e) => (e.preventDefault(), slot.classList.add("over")));
    slot.addEventListener("dragleave", () => slot.classList.remove("over"));
    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      slot.classList.remove("over");
      const file = e.dataTransfer.files?.[0];
      if (file) withUpload(fld.key, file);
    });
    slot.dataset.slot = fld.key;
    return h("div", { class: "field" }, h("label", {}, h("span", {}, fld.label, fld.optional ? h("span", { class: "hint" }, "  optional") : null)), slot);
  },
  mask(fld, v) {
    const has = v.image && S.masks.get(v.image.name)?.painted;
    const idle = fld.optional ? "Optional: paint on the image to keep the change inside that area." : "Paint the area to change directly on the image in the canvas.";
    return h(
      "div",
      { class: "field" },
      h("label", {}, fld.label, fld.optional ? h("span", { class: "hint" }, "  optional") : null),
      h("div", { class: "notice" + (has || fld.optional ? "" : " warn") }, icon(has ? "check" : "brush"), h("span", {}, has ? "Area painted. Adjust it on the canvas." : v.image ? idle : "Add the image first, then paint on it.")),
    );
  },
  model(fld, v) {
    const inv = famInventory();
    const models = inv.models || [];
    const unverified = new Set(inv.unverified || []);
    const variants = inv.variants || {};
    const presets = famSchema().presets || {};
    const label = (m) => `${shortName(m)}  ·  ${presets[variants[m]]?.label || (variants[m] === "turbo" ? "Turbo" : "Regular")}`;
    const sel = h("select", { "aria-label": fld.label, onchange: (e) => onModel(e.target.value) });
    if (!models.length) sel.append(h("option", { value: "" }, "No models found"));
    // Options grouped by folder, so subfolders (e.g. z-image/turbo, SDXL/regular) stay visible.
    const groups = new Map();
    for (const m of models.filter((x) => !unverified.has(x))) {
      const g = folderOf(m) || "Top folder";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(m);
    }
    for (const [g, list] of groups) {
      const opts = list.map((m) => h("option", { value: m }, label(m)));
      if (groups.size > 1 || g !== "Top folder") sel.append(h("optgroup", { label: g }, opts));
      else sel.append(...opts);
    }
    const odd = models.filter((m) => unverified.has(m));
    if (odd.length) sel.append(h("optgroup", { label: "Unrecognized names (assign in Setup)" }, odd.map((m) => h("option", { value: m }, label(m)))));
    if (v.model && !models.includes(v.model)) sel.append(h("option", { value: v.model }, shortName(v.model) + " (missing)"));
    sel.value = v.model || "";
    const variant = variants[v.model];
    return h(
      "div",
      { class: "field" },
      h("label", {}, fld.label, v.model ? h("span", { class: "hint mono", title: v.model }, folderOf(v.model)) : null),
      sel,
      variant ? h("div", { class: "hint" }, `${presets[variant]?.label || variant} settings applied automatically (change them under Advanced).`) : null,
    );
  },
  loras(fld, v) {
    const list = v.loras || [];
    const all = famInventory().loras || [];
    const rows = list.map((l, i) => {
      const strength = h("input", { type: "range", min: -1, max: 2, step: 0.05, value: l.strength ?? 1 });
      const out = h("span", { class: "value" }, fmt(l.strength ?? 1, 0.05));
      strength.oninput = () => {
        l.strength = Number(strength.value);
        out.textContent = fmt(l.strength, 0.05);
        setValue("loras", list, { silent: true });
      };
      const toggle = h("input", { type: "checkbox", checked: l.on !== false, "aria-label": "Use this LoRA", onchange: (e) => ((l.on = e.target.checked), setValue("loras", list)) });
      return h(
        "div",
        { class: "lora" + (l.on === false ? " off" : "") },
        h("div", { class: "name", title: l.name }, shortName(l.name), all.includes(l.name) ? null : h("span", { class: "hint" }, " · missing")),
        h("label", { class: "switch" }, toggle),
        h("button", { class: "icon-btn small", "aria-label": "Remove LoRA", onclick: () => (list.splice(i, 1), setValue("loras", list)) }, icon("x")),
        h("div", { class: "strength" }, strength, out),
      );
    });
    const add = h("button", { class: "btn small", onclick: (e) => loraPicker(e.currentTarget, list) }, icon("plus"), "Add LoRA");
    const unsorted = S.inventory?.unsortedLoras?.length || 0;
    return h(
      "div",
      { class: "field" },
      h("label", {}, fld.label, h("span", { class: "hint" }, all.length ? `${all.length} available` : "none installed for this family")),
      rows,
      h("div", { class: "chips" }, add, !all.length && unsorted ? h("button", { class: "link", onclick: () => emit("open-setup", { tab: "library" }) }, `${unsorted} unsorted LoRAs — assign them`) : null),
    );
  },
  size(fld, v) {
    const sizeBox = (k) => {
      const inp = h("input", { type: "number", min: 256, max: 2048, step: 64, value: v[k] });
      inp.onchange = () => setValue(k, Math.max(256, Math.min(2048, Math.round(Number(inp.value) / 16) * 16 || 1024)));
      return inp;
    };
    const chips = S.schema.aspects.map((a) =>
      h("button", { class: "chip", "aria-pressed": String(v.width === a.w && v.height === a.h), onclick: () => (Object.assign(values(), { width: a.w, height: a.h }), setValue("width", a.w)) }, a.id),
    );
    if (fld.fromImage && v.image) {
      const m = matchAspect(v.image.w, v.image.h);
      chips.unshift(h("button", { class: "chip", "aria-pressed": String(v.width === m.width && v.height === m.height), onclick: () => (Object.assign(values(), m), setValue("width", m.width)) }, "Match image"));
    }
    return h("div", { class: "field" }, h("label", {}, fld.label, h("span", { class: "value" }, `${v.width} × ${v.height}`)), h("div", { class: "chips" }, chips), h("div", { class: "row2" }, sizeBox("width"), sizeBox("height")));
  },
  edges(fld, v) {
    const box = (k) => {
      const inp = h("input", { type: "number", min: 0, max: 1024, step: 32, value: v[k] || 0 });
      inp.onchange = () => setValue(k, Math.max(0, Math.min(1024, Math.round(Number(inp.value) / 8) * 8 || 0)));
      return h("label", {}, k[0].toUpperCase() + k.slice(1), inp);
    };
    const preset = (label, e) => h("button", { class: "chip", onclick: () => (Object.assign(values(), { left: 0, right: 0, top: 0, bottom: 0, ...e }), setValue("left", values().left)) }, label);
    return h(
      "div",
      { class: "field" },
      h("label", {}, fld.label, v.image ? h("span", { class: "value" }, `${v.image.w + (v.left || 0) + (v.right || 0)} × ${v.image.h + (v.top || 0) + (v.bottom || 0)}`) : null),
      h("div", { class: "chips" }, preset("Wider", { left: 256, right: 256 }), preset("Taller", { top: 256, bottom: 256 }), preset("All sides", { left: 128, right: 128, top: 128, bottom: 128 }), preset("Reset", {})),
      h("div", { class: "row4" }, ["left", "right", "top", "bottom"].map(box)),
    );
  },
  slider(fld, v) {
    const val = v[fld.key] ?? fld.default;
    const out = h("span", { class: "value" }, fmt(val, fld.step));
    const range = h("input", { type: "range", min: fld.min, max: fld.max, step: fld.step, value: val, "aria-label": fld.label });
    range.oninput = () => {
      out.textContent = fmt(Number(range.value), fld.step);
      setValue(fld.key, Number(range.value), { silent: true });
    };
    return h("div", { class: "field" }, h("label", {}, fld.label, out), range, fld.hint ? h("div", { class: "hint" }, fld.hint) : null);
  },
  select(fld, v) {
    let choices = fld.choices;
    if (typeof choices === "string") {
      const list = choices === "controlnets" ? famInventory().controlnets || [] : S.inventory?.[choices] || famInventory()[choices] || [];
      choices = [{ value: "", label: "Automatic" }, ...list.map((n) => ({ value: n, label: shortName(n) }))];
    } else {
      // Only what this ComfyUI can run; a control type without its preprocessor still works
      // with an uploaded ready-made map, so it stays, marked.
      choices = choices.filter(offered).map((c) => ({ ...c, label: c.label + (c.status === "experimental" ? " (experimental)" : "") + (fld.key === "kind" && S.inventory?.preprocessors && S.inventory.preprocessors[c.value] === false && !v.isMap ? " — upload a map" : "") }));
      if (!choices.some((c) => String(c.value) === String(v[fld.key] ?? fld.default)) && choices[0]) v[fld.key] = choices[0].value;
    }
    const sel = h("select", { "aria-label": fld.label, onchange: (e) => setValue(fld.key, choices.find((c) => String(c.value) === e.target.value)?.value ?? e.target.value) }, choices.map((c) => h("option", { value: String(c.value) }, c.label)));
    sel.value = String(v[fld.key] ?? fld.default ?? "");
    return h("div", { class: "field" }, h("label", {}, fld.label), sel, fld.hint ? h("div", { class: "hint" }, fld.hint) : null);
  },
  toggle(fld, v) {
    const input = h("input", { type: "checkbox", checked: !!(v[fld.key] ?? fld.default) });
    input.onchange = () => {
      const on = input.checked;
      if (fld.preset) Object.assign(values(), on ? fld.preset.on : fld.preset.off);
      setValue(fld.key, on);
      if (fld.preset) toast(on ? `${fld.label}: ${Object.entries(fld.preset.on).map(([k, x]) => `${k} ${x}`).join(" · ")}` : "Standard settings restored", "", 2200);
    };
    return h("label", { class: "switch" }, h("span", { class: "text" }, fld.label, fld.hint ? h("span", { class: "hint" }, fld.hint) : null), input);
  },
  seed(fld, v) {
    const num = h("input", { type: "number", min: 0, value: v.seed || 0, disabled: v.randomSeed !== false, "aria-label": "Seed" });
    num.onchange = () => setValue("seed", Math.max(0, Math.floor(Number(num.value) || 0)), { silent: true });
    const rnd = h("input", { type: "checkbox", checked: v.randomSeed !== false });
    rnd.onchange = () => setValue("randomSeed", rnd.checked);
    return h("div", { class: "field" }, h("label", {}, "Seed"), h("div", { class: "row2" }, num, h("label", { class: "switch" }, h("span", { class: "text" }, "New seed each run"), rnd)));
  },
  sampling(fld, v) {
    const samplers = S.inventory?.samplers?.length ? S.inventory.samplers : FALLBACK_SAMPLERS;
    const schedulers = S.inventory?.schedulers?.length ? S.inventory.schedulers : FALLBACK_SCHEDULERS;
    const sel = (k, list) => {
      const s = h("select", { "aria-label": k, onchange: (e) => setValue(k, e.target.value, { silent: true }) }, list.map((x) => h("option", { value: x }, x)));
      s.value = v[k];
      return s;
    };
    return h(
      "div",
      { class: "field" },
      R.slider({ key: "steps", label: "Steps", min: 1, max: 80, step: 1 }, v),
      R.slider({ key: "cfg", label: "Guidance (CFG)", min: 0, max: 12, step: 0.1, hint: v.cfg <= 1 ? "CFG 1 = distilled / turbo mode (negative prompt is not used)" : "" }, v),
      h("div", { class: "row2" }, h("div", { class: "field" }, h("label", {}, "Sampler"), sel("sampler", samplers)), h("div", { class: "field" }, h("label", {}, "Scheduler"), sel("scheduler", schedulers))),
    );
  },
};
const folderOf = (n) => (String(n).includes("/") ? String(n).split("/").slice(0, -1).join("/") : "");

// Choosing a model applies its variant's preset (Turbo / Regular, from the inventory, which
// reads turbo/ and regular/ folders or the file name).
function applyPreset(v, name) {
  const variant = famInventory().variants?.[name];
  // A task may have its own Turbo / Regular settings (e.g. Krea 2 edits: 10 steps, RAW CFG 3.5).
  const preset = variant && (taskSchema().presets?.[variant] || famSchema().presets?.[variant]);
  if (!preset) return null;
  const changed = ["steps", "cfg", "sampler", "scheduler"].some((k) => v[k] !== preset[k]);
  Object.assign(v, { steps: preset.steps, cfg: preset.cfg, sampler: preset.sampler, scheduler: preset.scheduler });
  return changed ? preset : null;
}
function onModel(name) {
  const v = values();
  v.model = name;
  const preset = applyPreset(v, name);
  if (preset) toast(`${preset.label} settings: ${preset.steps} steps · CFG ${preset.cfg} · ${preset.sampler}`, "", 2600);
  setValue("model", name);
}
// A form without a model starts on the family's automatic pick, with its preset.
function ensureModel(v, t) {
  if (v.model || !(t.fields || []).some((f) => f.type === "model")) return;
  // A task can prefer a model type (Object Remove prefers RAW), else the family's own pick.
  const inv = famInventory();
  const auto = (t.preferVariant && (inv.models || []).find((m) => inv.variants?.[m] === t.preferVariant)) || inv.auto;
  if (!auto) return;
  v.model = auto;
  applyPreset(v, auto);
  setValue("model", auto, { silent: true });
}

function loraPicker(anchor, list) {
  const all = famInventory().loras || [];
  const used = new Set(list.map((l) => l.name));
  if (!all.length) return toast(`No ${famSchema().label} LoRAs found. Put them in a folder named after the family, or assign them in Setup → Library.`, "", 5000);
  const search = h("input", { type: "text", placeholder: "Search LoRAs…", "aria-label": "Search LoRAs" });
  const box = h("div", { class: "menu", style: { width: "300px", maxHeight: "340px", overflowY: "auto" } }, search);
  const results = h("div", { style: { display: "grid" } });
  box.append(results);
  const draw = () => {
    put(results, 
      ...all
        .filter((n) => !used.has(n) && n.toLowerCase().includes(search.value.toLowerCase()))
        .slice(0, 80)
        .map((n) => h("button", { title: n, onclick: () => (list.push({ name: n, strength: 1, on: true }), box.remove(), setValue("loras", list)) }, icon("plus"), h("span", {}, shortName(n), folderOf(n) ? h("span", { class: "hint" }, "  " + folderOf(n)) : null))),
    );
  };
  search.oninput = draw;
  draw();
  document.body.append(box);
  const r = anchor.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(innerWidth - 310, r.left)) + "px";
  box.style.top = Math.max(8, Math.min(innerHeight - 350, r.bottom + 6)) + "px";
  search.focus();
  setTimeout(() => document.addEventListener("pointerdown", function close(e) {
    if (!box.contains(e.target)) box.remove();
    else document.addEventListener("pointerdown", close, { once: true });
  }, { once: true }), 0);
}

// ---------- readiness checklist ----------
// Installed files as paths under ComfyUI/models/, the one Wire Studio uses by default first.
export function foundFiles(found, folder, preferred) {
  const top = String(folder || "").split("/")[0];
  const list = [...(found || [])].sort((a, b) => (b === preferred) - (a === preferred));
  return h(
    "span",
    { class: "found" },
    h("span", { class: "mono", title: list.join("\n") }, `models/${top ? top + "/" : ""}${list[0]}`),
    list.length > 1 ? h("span", { class: "faint" }, ` +${list.length - 1} more`) : null,
  );
}

// A task's requirements. Model rows always name the suggested file and its folder, and say
// which of your installed files Wire Studio uses for it.
export function needList(items, { onlyMissing = false, family = null } = {}) {
  const preferred = family ? S.inventory?.families?.[family]?.auto : null;
  return items
    .filter((n) => !onlyMissing || !n.ok)
    .map((n) => {
      const help = n.help || {};
      const file = help.file || n.label;
      const fileName = h("span", { class: "copy mono", title: "Copy file name", onclick: () => copyText(file) }, file);
      const folder = h("span", { class: "mono" }, `models/${help.folder || "…"}/`);
      const download = help.url ? h("a", { href: help.url, target: "_blank", rel: "noreferrer", class: "link" }, n.kind === "model" ? (/\/resolve\//.test(help.url) ? "Download" : "Get it") : "Open project page", " ↗") : null;
      let lines;
      if (n.kind !== "model") lines = n.ok ? [] : [h("span", {}, "Install ", h("b", {}, help.name || "the node pack")), download];
      else if (n.ok)
        lines = [
          n.found?.length ? h("span", {}, "Using ", foundFiles(n.found, help.folder, preferred)) : null,
          h("span", { class: "faint" }, "Suggested: ", fileName, " in ", folder),
        ];
      else lines = [h("span", {}, "Put ", fileName, " in ", folder), download];
      return h(
        "div",
        { class: "need" },
        icon(n.ok ? "check" : n.level === "required" ? "x" : "alert", n.ok ? "ok" : n.level === "required" ? "no" : "rec"),
        h("div", {}, h("div", { class: "t" }, n.label, n.level !== "required" ? h("span", { class: "hint" }, "  recommended") : null), h("div", { class: "d" }, n.why ? h("span", {}, n.why) : null, ...lines)),
      );
    });
}

// ---------- panel ----------
export function renderPanel() {
  const panel = document.getElementById("panel");
  const fam = famSchema();
  const t = taskSchema();
  const meta = taskMeta();
  const v = values();
  const r = readiness();
  if (!t.unavailable) ensureModel(v, t);
  const head = h("div", { class: "panel-head" }, h("h1", {}, meta.label, t.badge ? h("span", { class: "badge" + (/experimental|weak/i.test(t.badge) ? " warn" : "") }, t.badge) : null), h("p", {}, meta.about));

  if (t.unavailable) {
    put(panel, head, h("div", { class: "panel-body" }, h("div", { class: "notice warn" }, icon("info"), h("span", {}, t.unavailable))));
    return;
  }
  const body = h("div", { class: "panel-body" });
  if (!S.connection.ok)
    body.append(h("div", { class: "notice bad" }, icon("plug"), h("span", {}, "ComfyUI is not connected. ", h("button", { class: "link", onclick: () => emit("open-setup", {}) }, "Connect"))));
  else if (r?.state === "missing")
    body.append(h("div", { class: "card" }, h("h3", {}, icon("alert"), "Needs setup before it can run"), needList(r.items, { onlyMissing: true, family: S.family }), h("div", { class: "chips" }, h("button", { class: "btn small", onclick: () => emit("refresh") }, icon("refresh"), "Re-check"), h("button", { class: "btn small", onclick: () => emit("open-setup", { family: S.family, task: S.task }) }, "Open setup"))));
  else if (r?.state === "limited") {
    const missing = r.items.filter((n) => !n.ok);
    body.append(h("details", { class: "advanced" }, h("summary", {}, icon("info"), "Works now; better with add-ons", h("span", { class: "sum" }, String(missing.length))), h("div", { class: "inner" }, needList(missing, { family: S.family }))));
  }
  if (t.statusNote && t.status !== "ready") body.append(h("div", { class: "notice warn" }, icon("alert"), h("span", {}, `${t.status === "experimental" ? "Experimental" : "Limited"}: ${t.statusNote}`)));
  for (const note of t.notes || []) body.append(h("div", { class: "notice" }, icon("info"), h("span", {}, note)));

  const main = [];
  const adv = [];
  for (const fld of t.fields) {
    if (!visible(fld, v)) continue;
    const el = (R[fld.type] || R.slider)(fld, v);
    (fld.advanced ? adv : main).push(el);
  }
  body.append(...main);
  if (adv.length) {
    const sum = t.fields.some((f) => f.type === "sampling") ? `${v.steps} steps · CFG ${v.cfg}` : "";
    const det = h("details", { class: "advanced" }, h("summary", {}, icon("chev", "chev"), "Advanced", h("span", { class: "sum" }, sum)), h("div", { class: "inner" }, adv));
    det.open = !!S.advancedOpen;
    det.ontoggle = () => (S.advancedOpen = det.open);
    body.append(det);
  }

  const blocked = !S.connection.ok || r?.state === "missing";
  const runBtn = h("button", { class: "btn primary", id: "run", disabled: blocked, onclick: () => emit("run") }, icon("play"), meta.run);
  const foot = h(
    "div",
    { class: "panel-foot" },
    runBtn,
    h("div", { class: "meta" }, h("span", {}, `${fam.label} · ${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter`), h("button", { class: "link", onclick: () => emit("export") }, "Export workflow")),
  );
  // Keep the scroll position only when redrawing the same task's form.
  const same = panel.dataset.key === `${S.family}/${S.task}`;
  const scroll = same ? panel.querySelector(".panel-body")?.scrollTop || 0 : 0;
  put(panel, head, body, foot);
  panel.dataset.key = `${S.family}/${S.task}`;
  body.scrollTop = scroll;
}
