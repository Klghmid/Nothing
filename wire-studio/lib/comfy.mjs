// Thin ComfyUI HTTP client: timeouts on every call, cached /object_info (served stale while
// it refreshes in the background) and readable errors from /prompt.
export function normalizeUrl(value) {
  let address = String(value || "").trim();
  if (!address) throw Object.assign(new Error("Enter your ComfyUI address, e.g. http://127.0.0.1:8188"), { status: 400 });
  if (!/^https?:\/\//i.test(address)) address = "http://" + address;
  let url;
  try {
    url = new URL(address);
  } catch {
    throw Object.assign(new Error("That is not a valid address"), { status: 400 });
  }
  if (!["http:", "https:"].includes(url.protocol)) throw Object.assign(new Error("Use an http(s) address"), { status: 400 });
  if (!url.port && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) url.port = "8188";
  return url.origin + url.pathname.replace(/\/+$/, "");
}

// ComfyUI's /prompt validation errors → one readable sentence per problem.
export function describePromptError(data, prompt = {}) {
  const parts = [];
  if (data?.error?.message && data.error.type !== "prompt_outputs_failed_validation") parts.push(data.error.message + (data.error.details ? `: ${data.error.details}` : ""));
  for (const [id, err] of Object.entries(data?.node_errors || {})) {
    const title = prompt[id]?._meta?.title || err.class_type || id;
    for (const e of err.errors || []) parts.push(`${title}: ${e.details || e.message}`);
  }
  return parts.join(". ") || "ComfyUI refused the workflow";
}

export function createComfy(getUrl) {
  let info = null;
  let infoAt = 0;
  let pending = null;
  let infoUrl = null;
  const TTL = 120_000;

  async function request(route, { method = "GET", json, body, headers = {}, timeout = 15000 } = {}) {
    const base = getUrl();
    const url = new URL(route.replace(/^\//, ""), base.endsWith("/") ? base : base + "/");
    const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(timeout) };
    if (json !== undefined) {
      init.body = JSON.stringify(json);
      init.headers["content-type"] = "application/json";
    } else if (body !== undefined) init.body = body;
    try {
      return await fetch(url, init);
    } catch (e) {
      const reason = e.name === "TimeoutError" ? "timed out" : "is not reachable";
      throw Object.assign(new Error(`ComfyUI at ${base} ${reason}`), { status: 502, offline: true });
    }
  }
  async function getJSON(route, opts) {
    const r = await request(route, opts);
    if (!r.ok) throw Object.assign(new Error(`ComfyUI ${route} returned ${r.status}`), { status: 502 });
    return r.json();
  }

  async function loadInfo() {
    const url = getUrl();
    const data = await getJSON("/object_info", { timeout: 60000 });
    if (getUrl() === url) {
      info = data;
      infoAt = Date.now();
      infoUrl = url;
    }
    return data;
  }

  return {
    request,
    getJSON,
    // Fresh enough → cached; stale → cached now and refreshed in the background; none → wait.
    async objectInfo({ force = false } = {}) {
      const sameServer = infoUrl === getUrl();
      if (!force && info && sameServer && Date.now() - infoAt < TTL) return info;
      if (!pending) pending = loadInfo().finally(() => (pending = null));
      if (!force && info && sameServer) {
        pending.catch(() => {});
        return info;
      }
      return pending;
    },
    cachedInfo: () => (infoUrl === getUrl() ? info : null),
    reset() {
      info = null;
      infoUrl = null;
    },
    systemStats: () => getJSON("/system_stats", { timeout: 4000 }),
    async upload(bytes, filename, mime = "image/png") {
      const form = new FormData();
      form.append("image", new Blob([bytes], { type: mime }), filename);
      form.append("type", "input");
      form.append("overwrite", "false");
      const r = await request("/upload/image", { method: "POST", body: form, timeout: 60000 });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.name) throw Object.assign(new Error("ComfyUI did not accept the upload"), { status: 502 });
      return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
    },
    async queuePrompt(prompt, clientId) {
      const r = await request("/prompt", { method: "POST", json: { prompt, client_id: clientId, extra_data: { preview_method: "auto" } }, timeout: 30000 });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.prompt_id) throw Object.assign(new Error(describePromptError(data, prompt)), { status: 409 });
      return data.prompt_id;
    },
    history: (id) => getJSON("/history/" + encodeURIComponent(id), { timeout: 10000 }).then((h) => h?.[id] || null),
    queue: () => getJSON("/queue", { timeout: 6000 }),
    interrupt: (id) => request("/interrupt", { method: "POST", json: { prompt_id: id } }),
    removeQueued: (ids) => request("/queue", { method: "POST", json: { delete: ids } }),
    view: (params, timeout = 30000) => request("/view?" + new URLSearchParams(params), { timeout }),
  };
}
