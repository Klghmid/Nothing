// Wire Studio server: serves the UI, builds family workflows, talks to ComfyUI.
// No dependencies; Node 20+ (22+ adds live step progress through ComfyUI's websocket).
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createStore, flushAll } from "./lib/store.mjs";
import { createComfy, normalizeUrl } from "./lib/comfy.mjs";
import { createProgress } from "./lib/progress.mjs";
import { createJobs } from "./lib/jobs.mjs";
import { buildWorkflow, buildUtility, readiness, readInventory, schema, FAMILIES } from "./engine/index.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.WIRE_DATA || path.join(root, "data"));
const port = Number(process.env.PORT || 5180);
const host = process.env.HOST || "127.0.0.1";

const settings = createStore(path.join(dataDir, "settings.json"), {
  comfyUrl: process.env.COMFY_URL || "http://127.0.0.1:8188",
  clientId: "wire-studio-" + crypto.randomUUID(),
  family: "anima",
  task: "generate",
});
if (process.env.COMFY_URL) settings.get().comfyUrl = normalizeUrl(process.env.COMFY_URL);
settings.touch();
const forms = createStore(path.join(dataDir, "forms.json"), {});
const assignments = createStore(path.join(dataDir, "assignments.json"), {});
const snapshot = createStore(path.join(dataDir, "inventory-cache.json"), { url: "", at: 0, inventory: null, readiness: null });
const promoted = createStore(path.join(dataDir, "promoted.json"), {});

const comfy = createComfy(() => settings.get().comfyUrl);

// ---- Server-Sent Events -------------------------------------------------------------------
const clients = new Set();
function emit(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => {
  for (const res of clients) res.write(": keep-alive\n\n");
}, 20000).unref();

const jobs = createJobs({ dataDir, comfy, emit });
const progress = createProgress(() => settings.get().comfyUrl, settings.get().clientId, (evt) => {
  if (evt.type === "socket") emit("connection", { live: evt.live });
  else jobs.onEvent(evt);
});

// ---- Inventory / readiness ----------------------------------------------------------------
function contextFrom(info) {
  return { info, inv: readInventory(info, assignments.get()) };
}
function publicInventory(inv) {
  return { ...inv, families: inv.families };
}
function remember(ctx) {
  const value = { url: settings.get().comfyUrl, at: Date.now(), inventory: publicInventory(ctx.inv), readiness: readiness(ctx) };
  snapshot.set(value);
  return value;
}
async function context({ force = false } = {}) {
  return contextFrom(await comfy.objectInfo({ force }));
}
async function connection() {
  try {
    const s = await comfy.systemStats();
    const dev = s.devices?.[0];
    return { ok: true, url: settings.get().comfyUrl, version: s.system?.comfyui_version || "", gpu: dev ? { name: dev.name, vram: dev.vram_total, free: dev.vram_free } : null, live: progress.live() };
  } catch (e) {
    return { ok: false, url: settings.get().comfyUrl, error: e.message };
  }
}
// Waits briefly for fresh data; otherwise answers with the last snapshot (marked stale).
async function inventoryState({ force = false, wait = 3500 } = {}) {
  const snap = snapshot.get();
  const fresh = context({ force }).then(remember);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), wait).unref());
  try {
    const result = await Promise.race([fresh, timeout]);
    if (result) return { ...result, stale: false };
  } catch (e) {
    if (snap.url === settings.get().comfyUrl && snap.inventory) return { ...snap, stale: true, error: e.message };
    return { inventory: null, readiness: null, stale: true, error: e.message };
  }
  fresh.catch(() => {});
  if (snap.url === settings.get().comfyUrl && snap.inventory) return { ...snap, stale: true };
  return { inventory: null, readiness: null, stale: true, error: "ComfyUI is slow to answer; still loading" };
}

// ---- HTTP helpers ---------------------------------------------------------------------------
const send = (res, status, data) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
};
async function readBody(req, limit = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request is too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
const readJSON = async (req) => {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
};
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };
const VIEW_TYPES = new Set(["input", "output", "temp"]);
const safeName = (s) => String(s || "image.png").replace(/[^\w.\- ()]+/g, "_").slice(-120) || "image.png";

async function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const full = path.normalize(path.join(root, "public", rel));
  if (!full.startsWith(path.join(root, "public") + path.sep)) return send(res, 403, { error: "Forbidden" });
  let stat;
  try {
    stat = await fsp.stat(full);
  } catch {
    return send(res, 404, { error: "Not found" });
  }
  const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { etag });
    return res.end();
  }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", etag, "cache-control": "no-cache" });
  fs.createReadStream(full).pipe(res);
}

// ---- Routes -----------------------------------------------------------------------------------
async function route(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === "/api/health") return send(res, 200, { ok: true });

  if (p === "/api/bootstrap" && m === "GET") {
    const [conn, inv] = await Promise.all([connection(), inventoryState()]);
    progress.connect();
    return send(res, 200, {
      schema: schema(),
      settings: { comfyUrl: settings.get().comfyUrl, family: settings.get().family, task: settings.get().task },
      forms: forms.get(),
      connection: conn,
      ...inv,
      assignments: assignments.get(),
      jobs: jobs.list({ limit: 80 }),
    });
  }

  if (p === "/api/connect" && m === "POST") {
    const b = await readJSON(req);
    const comfyUrl = normalizeUrl(b.url);
    if (comfyUrl !== settings.get().comfyUrl) {
      settings.update((s) => (s.comfyUrl = comfyUrl));
      comfy.reset();
      progress.reset();
    }
    const conn = await connection();
    if (!conn.ok) return send(res, 200, { connection: conn, inventory: null, readiness: null });
    const inv = await inventoryState({ force: true, wait: 30000 });
    jobs.resume();
    return send(res, 200, { connection: conn, ...inv });
  }

  if (p === "/api/refresh" && m === "POST") {
    const [conn, inv] = await Promise.all([connection(), inventoryState({ force: true, wait: 30000 })]);
    return send(res, 200, { connection: conn, ...inv });
  }

  if (p === "/api/settings" && m === "PUT") {
    const b = await readJSON(req);
    settings.update((s) => {
      if (FAMILIES[b.family]) s.family = b.family;
      if (typeof b.task === "string" && b.task.length < 40) s.task = b.task;
    });
    return send(res, 200, { ok: true });
  }

  const formRoute = p.match(/^\/api\/forms\/(\w+)\/([\w-]+)$/);
  if (formRoute && m === "PUT") {
    const [, family, task] = formRoute;
    if (!FAMILIES[family] || !FAMILIES[family].tasks[task]) return send(res, 404, { error: "Unknown form" });
    const b = await readJSON(req);
    if (JSON.stringify(b).length > 64_000) return send(res, 413, { error: "Form is too large" });
    forms.update((f) => (f[`${family}/${task}`] = b));
    return send(res, 200, { ok: true });
  }

  if (p === "/api/assign" && m === "PUT") {
    const b = await readJSON(req);
    const name = String(b.name || "");
    if (!name) return send(res, 400, { error: "name is required" });
    assignments.update((a) => {
      if (FAMILIES[b.family]) a[name] = b.family;
      else delete a[name];
    });
    const inv = await inventoryState({ wait: 30000 });
    return send(res, 200, inv);
  }

  if (p === "/api/upload" && m === "POST") {
    const bytes = await readBody(req, 40_000_000);
    if (!bytes.length) return send(res, 400, { error: "Empty upload" });
    const name = await comfy.upload(bytes, safeName(decodeURIComponent(req.headers["x-filename"] || "image.png")), req.headers["content-type"] || "image/png");
    return send(res, 200, { name });
  }

  // Use a generated image as an input: copy it from ComfyUI's output folder into input.
  if (p === "/api/promote" && m === "POST") {
    const b = await readJSON(req);
    const im = b.image || {};
    if (!VIEW_TYPES.has(im.type) || !im.filename) return send(res, 400, { error: "Unknown image" });
    if (im.type === "input") return send(res, 200, { name: im.subfolder ? `${im.subfolder}/${im.filename}` : im.filename });
    const key = `${im.type}/${im.subfolder || ""}/${im.filename}`;
    if (promoted.get()[key]) return send(res, 200, { name: promoted.get()[key] });
    const r = await comfy.view({ filename: im.filename, subfolder: im.subfolder || "", type: im.type });
    if (!r.ok) return send(res, 404, { error: "ComfyUI no longer has this image" });
    const name = await comfy.upload(Buffer.from(await r.arrayBuffer()), safeName(im.filename), r.headers.get("content-type") || "image/png");
    promoted.update((x) => {
      x[key] = name;
      const keys = Object.keys(x);
      if (keys.length > 3000) delete x[keys[0]];
    });
    return send(res, 200, { name });
  }

  if (p === "/api/view" && m === "GET") {
    const q = { filename: url.searchParams.get("filename") || "", subfolder: url.searchParams.get("subfolder") || "", type: url.searchParams.get("type") || "output" };
    if (!q.filename || !VIEW_TYPES.has(q.type)) return send(res, 400, { error: "Bad image request" });
    const preview = url.searchParams.get("preview");
    if (preview && /^(webp|jpeg);\d{1,3}$/.test(preview)) q.preview = preview;
    const r = await comfy.view(q);
    res.writeHead(r.status, {
      "content-type": r.headers.get("content-type") || "image/png",
      "cache-control": r.ok && q.type !== "temp" ? "private, max-age=604800, immutable" : "no-store",
    });
    if (!r.body) return res.end();
    return Readable.fromWeb(r.body).pipe(res);
  }

  if ((p === "/api/run" || p === "/api/workflow") && m === "POST") {
    const b = await readJSON(req);
    const ctx = await context();
    const built = b.family === "utility" ? buildUtility(b.task, b.params || {}, ctx) : buildWorkflow(b.family, b.task, b.params || {}, ctx);
    if (p === "/api/workflow") return send(res, 200, built);
    progress.connect();
    const id = await comfy.queuePrompt(built.prompt, settings.get().clientId);
    const job = await jobs.add({ id, family: b.family, task: b.task, params: b.params, seed: built.seed, notes: built.notes, prompt: built.prompt });
    return send(res, 200, { job });
  }

  if (p === "/api/jobs" && m === "GET") {
    const limit = Math.min(200, Number(url.searchParams.get("limit")) || 60);
    const before = Number(url.searchParams.get("before")) || Infinity;
    return send(res, 200, { jobs: jobs.list({ limit, before, family: url.searchParams.get("family") || "", task: url.searchParams.get("task") || "" }) });
  }

  const jobRoute = p.match(/^\/api\/jobs\/([\w-]+)(?:\/(cancel|star|workflow|preview))?$/);
  if (jobRoute) {
    const [, id, action] = jobRoute;
    if (!action && m === "DELETE") return send(res, jobs.remove(id) ? 200 : 404, { ok: true });
    if (!action && m === "GET") {
      const job = jobs.get(id);
      return job ? send(res, 200, { job }) : send(res, 404, { error: "Unknown job" });
    }
    if (action === "cancel" && m === "POST") return send(res, 200, { job: await jobs.cancel(id) });
    if (action === "star" && m === "POST") return send(res, 200, { job: jobs.star(id, (await readJSON(req)).on) });
    if (action === "workflow" && m === "GET") {
      try {
        const text = await jobs.workflow(id);
        const job = jobs.get(id);
        res.writeHead(200, { "content-type": "application/json", "content-disposition": `attachment; filename="wire-studio-${job?.family || "job"}-${job?.task || ""}-${id.slice(0, 8)}.json"` });
        return res.end(text);
      } catch {
        return send(res, 404, { error: "No workflow saved for this job" });
      }
    }
    if (action === "preview" && m === "GET") {
      const pv = progress.preview(id);
      if (!pv) return send(res, 404, { error: "No preview yet" });
      res.writeHead(200, { "content-type": pv.mime, "cache-control": "no-store" });
      return res.end(pv.data);
    }
  }

  if (p === "/api/events" && m === "GET") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
    res.write("retry: 2000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (p.startsWith("/api/")) return send(res, 404, { error: "Not found" });
  return serveStatic(req, res, p);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    await route(req, res, url);
  } catch (e) {
    if (res.headersSent) return res.end();
    send(res, e.status || 500, { error: e.message || "Unexpected error", missing: e.missing });
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error(`Port ${port} is already in use. Start with PORT=<other port> or stop the other program.`);
  else console.error(e.message);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`Wire Studio  http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  console.log(`ComfyUI      ${settings.get().comfyUrl}`);
  jobs.resume();
});

async function shutdown() {
  progress.stop();
  for (const res of clients) res.end();
  await flushAll();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
