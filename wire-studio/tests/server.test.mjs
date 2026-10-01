import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { startMockComfy, makePNG } from "./mock-comfy.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

async function startServer(env) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, "server.mjs")], { env: { ...process.env, ...env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  const api = async (route, opts = {}) => {
    const r = await fetch(base + route, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, body: opts.json ? JSON.stringify(opts.json) : opts.body });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data, headers: r.headers };
  };
  const stop = () => new Promise((r) => { child.on("exit", r); child.kill("SIGTERM"); });
  return { base, api, stop, log: () => log };
}

// Collects Server-Sent Events from /api/events.
async function events(base) {
  const ctrl = new AbortController();
  const r = await fetch(base + "/api/events", { signal: ctrl.signal });
  const seen = [];
  (async () => {
    const dec = new TextDecoder();
    let buf = "";
    try {
      for await (const chunk of r.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (ev && data) seen.push({ event: ev, data: JSON.parse(data) });
        }
      }
    } catch {}
  })();
  return { seen, close: () => ctrl.abort() };
}
const waitFor = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error("timed out");
};

test("server end to end against a mock ComfyUI", async (t) => {
  const mock = await startMockComfy({ stepMs: 30, steps: 5 });
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "wire-"));
  let s = await startServer({ COMFY_URL: mock.url, WIRE_DATA: dataDir });
  t.after(async () => {
    await s.stop();
    await mock.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  await t.test("bootstrap returns everything the UI needs in one request", async () => {
    const { status, data } = await s.api("/api/bootstrap");
    assert.equal(status, 200);
    assert.equal(data.connection.ok, true);
    assert.equal(data.connection.version, "0.27.0");
    assert.equal(data.stale, false);
    assert.ok(data.schema.families.krea2.tasks.generate.fields.length);
    assert.equal(data.readiness.sdxl.generate.state, "ready");
    assert.deepEqual(data.inventory.families.anima.models, ["anima-base-v1.0.safetensors", "Anima/anima_turbo_int8.safetensors"]);
  });

  let job;
  await t.test("upload, run, live progress over SSE, results and workflow download", async () => {
    const ev = await events(s.base);
    const up = await s.api("/api/upload", { method: "POST", body: makePNG(320, 480, 2), headers: { "content-type": "image/png", "x-filename": encodeURIComponent("my photo.png") } });
    assert.equal(up.status, 200);
    assert.equal(up.data.name, "my photo.png");
    const run = await s.api("/api/run", { method: "POST", json: { family: "sdxl", task: "img2img", params: { image: up.data.name, imageW: 320, imageH: 480, prompt: "a cat", seed: 7 } } });
    assert.equal(run.status, 200, JSON.stringify(run.data));
    job = run.data.job;
    assert.equal(job.status, "queued");
    assert.equal(job.seed, 7);
    const done = await waitFor(async () => {
      const r = await s.api("/api/jobs/" + job.id);
      return r.data.job.status === "done" && r.data.job;
    });
    assert.equal(done.images.length, 1);
    assert.ok(ev.seen.some((e) => e.event === "progress" && e.data.id === job.id), "websocket progress relayed over SSE");
    assert.ok(ev.seen.some((e) => e.event === "job" && e.data.status === "done"));
    ev.close();
    const im = done.images[0];
    const view = await fetch(`${s.base}/api/view?` + new URLSearchParams(im));
    assert.equal(view.status, 200);
    assert.match(view.headers.get("cache-control"), /immutable/);
    const png = Buffer.from(await view.arrayBuffer());
    assert.equal(png.readUInt32BE(16), 320, "output keeps the source size");
    const wf = await s.api(`/api/jobs/${job.id}/workflow`);
    assert.ok(Object.values(wf.data).some((n) => n.class_type === "CheckpointLoaderSimple"));
    const promoted = await s.api("/api/promote", { method: "POST", json: { image: im } });
    assert.equal(promoted.status, 200);
    assert.ok(mock.state.uploads.includes(promoted.data.name));
    const again = await s.api("/api/promote", { method: "POST", json: { image: im } });
    assert.equal(again.data.name, promoted.data.name, "a promoted image is uploaded only once");
  });

  await t.test("validation errors come back readable, nothing is queued", async () => {
    const before = mock.state.prompts.length;
    const r = await s.api("/api/run", { method: "POST", json: { family: "anima", task: "generate", params: { prompt: "x", loras: [{ name: "sdxl/pixel-art-xl.safetensors" }] } } });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /not a Anima LoRA/);
    const r2 = await s.api("/api/run", { method: "POST", json: { family: "sdxl", task: "inpaint", params: { image: "example.png", imageW: 640, imageH: 960 } } });
    assert.match(r2.data.error, /Paint the area/);
    assert.equal(mock.state.prompts.length, before);
  });

  await t.test("cancel interrupts only our running job", async () => {
    const run = await s.api("/api/run", { method: "POST", json: { family: "zimage", task: "generate", params: { prompt: "slow", steps: 8 } } });
    const id = run.data.job.id;
    await waitFor(async () => (await s.api("/api/jobs/" + id)).data.job.status === "running");
    const c = await s.api(`/api/jobs/${id}/cancel`, { method: "POST" });
    assert.equal(c.data.job.status, "cancelled");
    assert.ok(mock.state.interrupted.includes(id));
  });

  await t.test("forms, settings and jobs survive a restart", async () => {
    await s.api("/api/forms/krea2/generate", { method: "PUT", json: { prompt: "kept", width: 832 } });
    await s.api("/api/settings", { method: "PUT", json: { family: "krea2", task: "generate" } });
    await s.api(`/api/jobs/${job.id}/star`, { method: "POST", json: { on: true } });
    await s.stop();
    s = await startServer({ COMFY_URL: mock.url, WIRE_DATA: dataDir });
    const { data } = await s.api("/api/bootstrap");
    assert.equal(data.forms["krea2/generate"].prompt, "kept");
    assert.equal(data.settings.family, "krea2");
    const kept = data.jobs.find((j) => j.id === job.id);
    assert.ok(kept?.starred && kept.images.length === 1);
  });

  await t.test("a damaged data file falls back to its backup", async () => {
    await s.api("/api/forms/sdxl/generate", { method: "PUT", json: { prompt: "first" } });
    await new Promise((r) => setTimeout(r, 400));
    await s.api("/api/forms/sdxl/generate", { method: "PUT", json: { prompt: "second" } });
    await s.stop();
    await fs.writeFile(path.join(dataDir, "forms.json"), "{ broken");
    s = await startServer({ COMFY_URL: mock.url, WIRE_DATA: dataDir });
    const { data } = await s.api("/api/bootstrap");
    assert.equal(data.forms["sdxl/generate"].prompt, "first");
  });

  await t.test("library assignment moves an unsorted LoRA into a family", async () => {
    const r = await s.api("/api/assign", { method: "PUT", json: { name: "detail_slider.safetensors", family: "sdxl" } });
    assert.ok(r.data.inventory.families.sdxl.loras.includes("detail_slider.safetensors"));
    assert.ok(!r.data.inventory.unsortedLoras.includes("detail_slider.safetensors"));
  });

  await t.test("an unreachable ComfyUI is reported, then reconnecting works", async () => {
    const bad = await s.api("/api/connect", { method: "POST", json: { url: "127.0.0.1:9" } });
    assert.equal(bad.data.connection.ok, false);
    const good = await s.api("/api/connect", { method: "POST", json: { url: mock.url } });
    assert.equal(good.data.connection.ok, true);
    assert.ok(good.data.inventory.families.zimage.models.length);
  });
});
