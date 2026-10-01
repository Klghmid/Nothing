// Live step progress and preview frames from ComfyUI's websocket (filtered by our client id).
// Optional: Node 22+ has a global WebSocket; without it the job poller still tracks status.
export function createProgress(getUrl, clientId, onEvent) {
  const previews = new Map();
  let ws = null;
  let wsUrl = null;
  let current = null;
  let retry = null;
  let stopped = false;

  function handleBinary(buf) {
    if (buf.length < 8) return;
    const type = buf.readUInt32BE(0);
    let id = current, data, mime;
    if (type === 1) {
      data = buf.subarray(8);
      mime = buf.readUInt32BE(4) === 2 ? "image/png" : "image/jpeg";
    } else if (type === 4) {
      // PREVIEW_IMAGE_WITH_METADATA: [type][meta length][meta JSON][image]
      const len = buf.readUInt32BE(4);
      try {
        const meta = JSON.parse(buf.subarray(8, 8 + len).toString("utf8"));
        id = meta.prompt_id || id;
        mime = meta.image_type || "image/jpeg";
      } catch {
        return;
      }
      data = buf.subarray(8 + len);
    } else return;
    if (!id) return;
    previews.set(id, { data: Buffer.from(data), mime, at: Date.now() });
    if (previews.size > 24) previews.delete(previews.keys().next().value);
    onEvent({ type: "preview", id });
  }

  function handleText(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    const d = msg.data || {};
    if (msg.type === "execution_start") current = d.prompt_id;
    if (msg.type === "executing" && d.node == null && d.prompt_id === current) current = null;
    if (!d.prompt_id) return;
    if (msg.type === "execution_start") onEvent({ type: "started", id: d.prompt_id });
    if (msg.type === "progress") onEvent({ type: "progress", id: d.prompt_id, value: d.value, max: d.max, node: d.node });
    if (msg.type === "executing" && d.node) onEvent({ type: "node", id: d.prompt_id, node: d.node });
    if (["execution_success", "execution_error", "execution_interrupted"].includes(msg.type) || (msg.type === "executing" && d.node == null)) onEvent({ type: "settle", id: d.prompt_id });
  }

  function connect() {
    if (stopped || typeof WebSocket === "undefined") return;
    const base = getUrl();
    if (ws && wsUrl === base) return;
    try {
      ws?.close();
    } catch {}
    wsUrl = base;
    const target = new URL("ws?clientId=" + encodeURIComponent(clientId), base.endsWith("/") ? base : base + "/");
    target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
    let socket;
    try {
      socket = new WebSocket(target);
    } catch {
      return;
    }
    ws = socket;
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({ type: "feature_flags", data: { supports_preview_metadata: true } }));
      } catch {}
      onEvent({ type: "socket", live: true });
    };
    socket.onmessage = (e) => (typeof e.data === "string" ? handleText(e.data) : handleBinary(Buffer.from(e.data)));
    socket.onclose = () => {
      if (ws === socket) ws = null;
      onEvent({ type: "socket", live: false });
      clearTimeout(retry);
      retry = setTimeout(connect, 4000);
      retry.unref?.();
    };
    socket.onerror = () => {};
  }

  return {
    connect,
    reset() {
      wsUrl = null;
      try {
        ws?.close();
      } catch {}
      ws = null;
      connect();
    },
    stop() {
      stopped = true;
      clearTimeout(retry);
      try {
        ws?.close();
      } catch {}
    },
    preview: (id) => previews.get(id) || null,
    live: () => !!ws && ws.readyState === 1,
  };
}
