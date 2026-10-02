// A small stand-in for ComfyUI (no GPU): the real HTTP endpoints, ComfyUI-style graph
// validation, a sequential queue with step progress over a real websocket, and PNG outputs.
import http from "node:http";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { objectInfo, FILES } from "./fixtures.mjs";
import { validatePrompt } from "./comfy-validate.mjs";

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function makePNG(w, h, seed = 1) {
  const hue = (seed * 47) % 360;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const cx = w * (0.3 + ((seed % 5) / 10)), cy = h * 0.45, r = Math.min(w, h) * 0.22;
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2;
      const inside = (x - cx) ** 2 + (y - cy) ** 2 < r * r;
      const a = ((hue + t * 90) % 360) / 60;
      const v = inside ? 235 : 70 + t * 120;
      const k = v * (1 - Math.abs((a % 2) - 1));
      const [R, G, B] = a < 1 ? [v, k, 40] : a < 2 ? [k, v, 40] : a < 3 ? [40, v, k] : a < 4 ? [40, k, v] : a < 5 ? [k, 40, v] : [v, 40, k];
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = R;
      raw[o + 1] = G;
      raw[o + 2] = B;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
}
const pngSize = (buf) => (buf.length > 24 && buf.readUInt32BE(12) === 0x49484452 ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null);

function wsFrame(payload, opcode) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x80 | opcode, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
  return Buffer.concat([head, payload]);
}

function parseMultipart(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || "");
  if (!boundary) return {};
  const sep = Buffer.from("--" + (boundary[1] || boundary[2]));
  const parts = {};
  let start = body.indexOf(sep);
  while (start >= 0) {
    const next = body.indexOf(sep, start + sep.length);
    if (next < 0) break;
    const part = body.subarray(start + sep.length + 2, next - 2);
    const split = part.indexOf("\r\n\r\n");
    const head = part.subarray(0, split).toString();
    const name = /name="([^"]+)"/.exec(head)?.[1];
    const filename = /filename="([^"]*)"/.exec(head)?.[1];
    if (name) parts[name] = { filename, data: part.subarray(split + 4) };
    start = next;
  }
  return parts;
}

export function startMockComfy({ port = 0, info = objectInfo(), stepMs = 40, steps = 5, version = "0.27.0", previewSize = 64 } = {}) {
  const inputs = new Map(FILES.inputs.map((n) => [n, makePNG(640, 960, 3)]));
  const outputs = new Map();
  const history = {};
  const queue = [];
  let running = null;
  let counter = 0;
  const sockets = new Map();
  const state = { prompts: [], uploads: [], interrupted: [] };

  const broadcast = (clientId, msg) => {
    const s = sockets.get(clientId);
    if (s && !s.destroyed) s.write(wsFrame(Buffer.from(JSON.stringify(msg)), 1));
  };
  const broadcastBinary = (clientId, buf) => {
    const s = sockets.get(clientId);
    if (s && !s.destroyed) s.write(wsFrame(buf, 2));
  };

  // The same checks as ComfyUI's POST /prompt (shared with the tests), in its error format.
  function validate(prompt) {
    const errors = {};
    for (const e of validatePrompt(prompt, info, { images: inputs })) {
      if (!e.id) continue;
      (errors[e.id] ||= { errors: [], class_type: e.class_type }).errors.push({ message: "Prompt validation failed", details: e.message });
    }
    return errors;
  }

  function outputSize(prompt) {
    const nodes = Object.values(prompt);
    const scale = nodes.filter((n) => n.class_type === "ImageScale" && typeof n.inputs.width === "number").at(-1);
    if (scale) return { w: scale.inputs.width, h: scale.inputs.height };
    const latent = nodes.find((n) => /Empty(SD3)?Latent/.test(n.class_type));
    if (latent) return { w: latent.inputs.width, h: latent.inputs.height };
    const load = nodes.find((n) => n.class_type === "LoadImage");
    const size = load && pngSize(inputs.get(load.inputs.image) || Buffer.alloc(0));
    const pad = nodes.find((n) => n.class_type === "ImagePadForOutpaint");
    if (size) return { w: size.w + (pad ? pad.inputs.left + pad.inputs.right : 0), h: size.h + (pad ? pad.inputs.top + pad.inputs.bottom : 0) };
    return { w: 768, h: 768 };
  }

  function finish(job, interrupted) {
    const { id, prompt, number, clientId } = job;
    const saveId = Object.entries(prompt).find(([, n]) => n.class_type === "SaveImage")?.[0];
    const outputsOf = {};
    if (!interrupted && saveId) {
      let { w, h } = outputSize(prompt);
      const k = Math.min(1, 1024 / Math.max(w, h));
      w = Math.max(16, Math.round(w * k));
      h = Math.max(16, Math.round(h * k));
      const filename = `${prompt[saveId].inputs.filename_prefix.split("/").pop()}_${String(++counter).padStart(5, "0")}_.png`;
      const subfolder = prompt[saveId].inputs.filename_prefix.split("/").slice(0, -1).join("/");
      outputs.set(`${subfolder}/${filename}`, makePNG(w, h, counter + 5));
      outputsOf[saveId] = { images: [{ filename, subfolder, type: "output" }] };
    }
    history[id] = {
      prompt: [number, id, prompt, { client_id: clientId }, [saveId]],
      outputs: outputsOf,
      status: interrupted ? { status_str: "error", completed: false, messages: [["execution_start", {}], ["execution_interrupted", { prompt_id: id }]] } : { status_str: "success", completed: true, messages: [["execution_start", {}], ["execution_success", {}]] },
    };
    broadcast(clientId, { type: interrupted ? "execution_interrupted" : "execution_success", data: { prompt_id: id } });
    broadcast(clientId, { type: "executing", data: { node: null, prompt_id: id } });
    running = null;
    setTimeout(next, 10);
  }

  function next() {
    if (running || !queue.length) return;
    running = queue.shift();
    running.step = 0;
    const job = running;
    broadcast(job.clientId, { type: "execution_start", data: { prompt_id: job.id } });
    const sampler = Object.keys(job.prompt).find((k) => job.prompt[k].class_type === "KSampler") || "1";
    const tick = () => {
      if (running !== job) return;
      if (job.interrupt) return finish(job, true);
      job.step++;
      broadcast(job.clientId, { type: "progress", data: { value: job.step, max: steps, prompt_id: job.id, node: sampler } });
      if (job.step === 2) {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(1, 0);
        head.writeUInt32BE(2, 4);
        broadcastBinary(job.clientId, Buffer.concat([head, makePNG(previewSize, previewSize, 9)]));
      }
      if (job.step >= steps) return finish(job, false);
      setTimeout(tick, stepMs);
    };
    setTimeout(tick, stepMs);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const json = (status, data) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const p = url.pathname;
    if (p === "/system_stats") return json(200, { system: { comfyui_version: version, os: "posix" }, devices: [{ name: "Mock GPU 16GB", type: "cuda", vram_total: 17179869184, vram_free: 15000000000 }] });
    if (p === "/object_info") return json(200, info);
    if (p.startsWith("/object_info/")) {
      const n = decodeURIComponent(p.slice(13));
      return json(200, info[n] ? { [n]: info[n] } : {});
    }
    if (p === "/upload/image" && req.method === "POST") {
      const parts = parseMultipart(body, req.headers["content-type"]);
      if (!parts.image) return json(400, { error: "no image" });
      let name = parts.image.filename || "upload.png";
      if (inputs.has(name) && !inputs.get(name).equals(parts.image.data)) name = name.replace(/(\.\w+)?$/, ` (${inputs.size})$1`);
      inputs.set(name, parts.image.data);
      if (!info.LoadImage.input.required.image[0].includes(name)) info.LoadImage.input.required.image[0].push(name);
      state.uploads.push(name);
      return json(200, { name, subfolder: "", type: "input" });
    }
    if (p === "/view") {
      const type = url.searchParams.get("type");
      const key = type === "input" ? url.searchParams.get("filename") : `${url.searchParams.get("subfolder") || ""}/${url.searchParams.get("filename")}`;
      const data = (type === "input" ? inputs : outputs).get(key);
      if (!data) return json(404, { error: "not found" });
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(data);
    }
    if (p === "/prompt" && req.method === "POST") {
      const b = JSON.parse(body.toString() || "{}");
      const errors = validate(b.prompt || {});
      if (Object.keys(errors).length) return json(400, { error: { type: "prompt_outputs_failed_validation", message: "Prompt outputs failed validation", details: "" }, node_errors: errors });
      const id = crypto.randomUUID();
      const job = { id, prompt: b.prompt, number: ++counter, clientId: b.client_id };
      state.prompts.push(job);
      queue.push(job);
      setTimeout(next, 30);
      return json(200, { prompt_id: id, number: job.number, node_errors: {} });
    }
    if (p === "/queue" && req.method === "GET") {
      const entry = (j) => [j.number, j.id, j.prompt, { client_id: j.clientId }, []];
      return json(200, { queue_running: running ? [entry(running)] : [], queue_pending: queue.map(entry) });
    }
    if (p === "/queue" && req.method === "POST") {
      const b = JSON.parse(body.toString() || "{}");
      for (const id of b.delete || []) {
        const i = queue.findIndex((j) => j.id === id);
        if (i >= 0) queue.splice(i, 1);
      }
      return json(200, {});
    }
    if (p === "/interrupt" && req.method === "POST") {
      const b = JSON.parse(body.toString() || "{}");
      state.interrupted.push(b.prompt_id);
      if (running && (!b.prompt_id || b.prompt_id === running.id)) running.interrupt = true;
      return json(200, {});
    }
    if (p.startsWith("/history/")) {
      const id = p.slice(9);
      return json(200, history[id] ? { [id]: history[id] } : {});
    }
    json(404, { error: "not found" });
  });

  const all = new Set();
  server.on("connection", (socket) => {
    all.add(socket);
    socket.on("close", () => all.delete(socket));
  });
  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname !== "/ws") return socket.destroy();
    const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const clientId = url.searchParams.get("clientId");
    sockets.set(clientId, socket);
    socket.on("data", () => {});
    socket.on("error", () => {});
    socket.on("close", () => sockets.get(clientId) === socket && sockets.delete(clientId));
    socket.write(wsFrame(Buffer.from(JSON.stringify({ type: "status", data: { sid: clientId, status: { exec_info: { queue_remaining: 0 } } } })), 1));
  });

  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        state,
        close: () => new Promise((r) => {
          server.close(() => r());
          for (const s of all) s.destroy();
          setTimeout(r, 500).unref();
        }),
      }),
    ),
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const port = Number(process.env.MOCK_PORT || 8188);
  startMockComfy({ port, stepMs: 250, steps: 12 }).then(({ url }) => console.log("Mock ComfyUI", url));
}
