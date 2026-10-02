// Tiny DOM helpers, icon set, toasts and menus (no framework).
export function h(tag, attrs = {}, ...children) {
  const el = tag === "svg" || tag === "path" ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "style" && typeof v === "object") for (const [p, x] of Object.entries(v)) p.startsWith("--") ? el.style.setProperty(p, x) : (el.style[p] = x);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k in el && !["list", "form", "type"].includes(k) && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
// replaceChildren that skips null / false (conditional children).
export const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));

const PATHS = {
  sparkles: "M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 18l10 5 10-5",
  wand: "m15 4 5 5M14 5 4 15l5 5L19 10M17 2v2M21 6h-2M7 3l.5 1.5L9 5l-1.5.5L7 7l-.5-1.5L5 5l1.5-.5z",
  brush: "M9.5 14.5 4 20M14 4l6 6-8 8-6-6zM13 9l2 2",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 9h6v6H9z",
  face: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01",
  hand: "M18 11V6a1.5 1.5 0 0 0-3 0v4M15 10V4.5a1.5 1.5 0 0 0-3 0V10M12 10V5.5a1.5 1.5 0 0 0-3 0V12M9 12V9a1.5 1.5 0 0 0-3 0v6.5A6.5 6.5 0 0 0 12.5 22h.2a6.3 6.3 0 0 0 5.3-2.9l2.4-4a1.6 1.6 0 0 0-2.6-1.8L16 15",
  swap: "M7 4 3 8l4 4M3 8h13a4 4 0 0 1 0 8h-1M17 20l4-4-4-4M21 16H8",
  pose: "M12 5.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM5 9l7 1 7-3M12 10v5M12 15l-4 6M12 15l3 6",
  palette: "M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-.9-.7-1.3-.7-2.2 0-.8.7-1.3 1.5-1.3H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  zoom: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M11 8v6M8 11h6",
  image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  x: "M18 6 6 18M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  gallery: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  queue: "M3 6h18M3 12h12M3 18h8M17 15l4 3-4 3z",
  star: "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  chev: "m9 6 6 6-6 6",
  left: "m15 6-6 6 6 6",
  right: "m9 6 6 6-6 6",
  play: "M6 4l14 8-14 8z",
  dice: "M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01",
  refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  plug: "M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5",
  eraser: "m7 21-4-4 11-11 7 7-8 8zM22 21H7M5 13l7 7",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  invert: "M12 22a10 10 0 1 0 0-20zM12 2v20",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  plus: "M12 5v14M5 12h14",
  external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  more: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  code: "m16 18 6-6-6-6M8 6l-6 6 6 6",
  scissors: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  loader: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8",
  clipboard: "M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
};
export function icon(name, cls = "") {
  const svg = h("svg", { class: "i " + cls, viewBox: "0 0 24 24", "aria-hidden": "true" });
  svg.append(h("path", { d: PATHS[name] || PATHS.info }));
  return svg;
}

export function toast(message, kind = "", ms = 3800) {
  const box = document.getElementById("toasts");
  for (const t of box.children) if (t.dataset.msg === message) t.remove();
  while (box.children.length >= 3) box.firstElementChild.remove();
  const el = h("div", { class: "toast " + kind, "data-msg": message }, icon(kind === "bad" ? "alert" : kind === "ok" ? "check" : "info"), h("span", {}, message));
  box.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

let openMenu = null;
export function closeMenu() {
  openMenu?.remove();
  openMenu = null;
}
// A small context menu next to an anchor. items: [{label, icon, onClick} | "-" | {head}]
export function menu(anchor, items) {
  closeMenu();
  const el = h(
    "div",
    { class: "menu", role: "menu" },
    items.map((it) =>
      it === "-" ? h("div", { class: "sep" }) : it.head ? h("div", { class: "head" }, it.head) : h("button", { role: "menuitem", onclick: () => (closeMenu(), it.onClick()) }, it.icon ? icon(it.icon) : null, it.label),
    ),
  );
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, hgt = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
  el.style.top = (r.bottom + hgt + 8 > innerHeight ? Math.max(8, r.top - hgt - 6) : r.bottom + 6) + "px";
  openMenu = el;
  setTimeout(() => document.addEventListener("pointerdown", (e) => !el.contains(e.target) && closeMenu(), { once: true }), 0);
  return el;
}

export const fmtTime = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  return new Date(t).toLocaleDateString();
};
export const shortName = (n) => String(n || "").split(/[\\/]/).pop().replace(/\.(safetensors|ckpt|pt|pth|onnx|gguf)$/i, "");
export const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied", "ok", 1500);
  } catch {
    toast(text);
  }
}
