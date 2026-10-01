// Server API client.
async function call(route, { method = "GET", json, body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers["content-type"] = "application/json";
  } else if (body !== undefined) init.body = body;
  let r;
  try {
    r = await fetch(route, init);
  } catch {
    throw Object.assign(new Error("Wire Studio server is not reachable. Is it still running?"), { offline: true });
  }
  const type = r.headers.get("content-type") || "";
  const data = type.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw Object.assign(new Error(data?.error || `Request failed (${r.status})`), { status: r.status, missing: data?.missing });
  return data;
}

export const api = {
  bootstrap: () => call("/api/bootstrap"),
  connect: (url) => call("/api/connect", { method: "POST", json: { url } }),
  refresh: () => call("/api/refresh", { method: "POST" }),
  saveForm: (family, task, values) => call(`/api/forms/${family}/${task}`, { method: "PUT", json: values }),
  saveSettings: (s) => call("/api/settings", { method: "PUT", json: s }),
  assign: (name, family) => call("/api/assign", { method: "PUT", json: { name, family } }),
  upload: (blob, filename) => call("/api/upload", { method: "POST", body: blob, headers: { "content-type": blob.type || "image/png", "x-filename": encodeURIComponent(filename || "image.png") } }),
  promote: (image) => call("/api/promote", { method: "POST", json: { image } }),
  run: (family, task, params) => call("/api/run", { method: "POST", json: { family, task, params } }),
  workflow: (family, task, params) => call("/api/workflow", { method: "POST", json: { family, task, params } }),
  jobs: (q = {}) => call("/api/jobs?" + new URLSearchParams(q)),
  cancel: (id) => call(`/api/jobs/${id}/cancel`, { method: "POST" }),
  remove: (id) => call(`/api/jobs/${id}`, { method: "DELETE" }),
  star: (id, on) => call(`/api/jobs/${id}/star`, { method: "POST", json: { on } }),
};

export const viewUrl = (im, preview) =>
  "/api/view?" + new URLSearchParams({ filename: im.filename, subfolder: im.subfolder || "", type: im.type || "output", ...(preview ? { preview } : {}) });
// An input-folder image by its ComfyUI name ("sub/name.png" or "name.png").
export function inputUrl(name, preview) {
  const parts = String(name).split("/");
  const filename = parts.pop();
  return viewUrl({ filename, subfolder: parts.join("/"), type: "input" }, preview);
}
export const thumb = (im) => viewUrl(im, "webp;78");
