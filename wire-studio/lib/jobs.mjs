// Jobs submitted by this app: persisted on status changes (not on every progress tick), with
// the exact API workflow of each job kept in its own file (data/workflows/<id>.json) so the
// job list itself stays small and loads instantly.
import fsp from "node:fs/promises";
import path from "node:path";
import { createStore } from "./store.mjs";

const ACTIVE = new Set(["queued", "running"]);
const KEEP = 1000;

// Form values worth keeping with a job (no big strings).
function cleanParams(params = {}) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v.length > 4000) continue;
    out[k] = v;
  }
  return out;
}

export function createJobs({ dataDir, comfy, emit }) {
  const store = createStore(path.join(dataDir, "jobs.json"), { list: [] });
  const flowDir = path.join(dataDir, "workflows");
  const progress = new Map();
  const misses = new Map();
  let timer = null;
  let polling = false;

  const list = () => store.get().list;
  const find = (id) => list().find((j) => j.id === id);
  const publicJob = (j) => (j ? { ...j, progress: progress.get(j.id) || null } : null);
  const changed = (job) => {
    store.touch();
    emit("job", publicJob(job));
  };
  const active = () => list().filter((j) => ACTIVE.has(j.status));

  function trim() {
    const all = list();
    if (all.length <= KEEP) return;
    const drop = all.slice(0, all.length - KEEP).filter((j) => !j.starred && !ACTIVE.has(j.status));
    const ids = new Set(drop.map((j) => j.id));
    store.get().list = all.filter((j) => !ids.has(j.id));
    for (const id of ids) fsp.rm(path.join(flowDir, id + ".json"), { force: true }).catch(() => {});
  }

  async function settle(job) {
    if (!ACTIVE.has(job.status)) return;
    let record;
    try {
      record = await comfy.history(job.id);
    } catch {
      return;
    }
    if (!record) {
      // Not running, not queued, no history: give it a few polls, then report it as lost.
      const n = (misses.get(job.id) || 0) + 1;
      misses.set(job.id, n);
      if (n >= 4) {
        Object.assign(job, { status: "error", error: "ComfyUI no longer has this job (was it restarted?)", finished: Date.now() });
        misses.delete(job.id);
        progress.delete(job.id);
        changed(job);
      }
      return;
    }
    const st = record.status || {};
    const messages = st.messages || [];
    if (st.status_str === "error" || messages.some((m) => m[0] === "execution_interrupted")) {
      const err = messages.find((m) => m[0] === "execution_error")?.[1];
      const interrupted = messages.some((m) => m[0] === "execution_interrupted");
      Object.assign(job, {
        status: interrupted ? "cancelled" : "error",
        error: interrupted ? "" : err ? `${err.node_type || "Node"}: ${err.exception_message || "failed"}`.trim() : "ComfyUI reported an error",
        finished: Date.now(),
      });
    } else if (st.completed || st.status_str === "success") {
      const images = Object.values(record.outputs || {})
        .flatMap((o) => o.images || [])
        .filter((im) => im.type === "output")
        .map(({ filename, subfolder, type }) => ({ filename, subfolder: subfolder || "", type }));
      Object.assign(job, { status: "done", images, finished: Date.now() });
    } else return;
    misses.delete(job.id);
    progress.delete(job.id);
    changed(job);
  }

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const jobs = active();
      if (!jobs.length) return;
      let q;
      try {
        q = await comfy.queue();
      } catch {
        return;
      }
      const running = new Set((q.queue_running || []).map((x) => x[1]));
      const pending = (q.queue_pending || []).slice().sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      for (const job of jobs) {
        if (running.has(job.id)) {
          if (job.status !== "running") {
            Object.assign(job, { status: "running", started: job.started || Date.now(), position: 0 });
            changed(job);
          }
        } else if (pending.includes(job.id)) {
          const position = pending.indexOf(job.id) + 1;
          if (job.position !== position) {
            job.position = position;
            emit("job", publicJob(job));
          }
        } else await settle(job);
      }
    } finally {
      polling = false;
      schedule();
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!active().length) return;
    timer = setTimeout(poll, 1000);
    timer.unref?.();
  }

  return {
    list: ({ limit = 60, before = Infinity, family, task } = {}) =>
      list()
        .filter((j) => j.created < before && (!family || j.family === family) && (!task || j.task === task))
        .slice(-limit)
        .reverse()
        .map(publicJob),
    get: (id) => publicJob(find(id)),
    async add({ id, family, task, params, seed, notes, prompt }) {
      const job = { id, family, task, status: "queued", created: Date.now(), seed, notes: notes || [], params: cleanParams(params), images: [], position: null };
      list().push(job);
      trim();
      changed(job);
      fsp.mkdir(flowDir, { recursive: true })
        .then(() => fsp.writeFile(path.join(flowDir, id + ".json"), JSON.stringify(prompt, null, 2)))
        .catch((e) => console.error("Could not save workflow:", e.message));
      schedule();
      return publicJob(job);
    },
    workflow: (id) => (/^[\w-]+$/.test(id) ? fsp.readFile(path.join(flowDir, id + ".json"), "utf8") : Promise.reject(new Error("bad id"))),
    // Events from the websocket (progress, previews, finish).
    onEvent(evt) {
      const job = evt.id && find(evt.id);
      if (!job) return;
      if (evt.type === "started" && job.status !== "running") {
        Object.assign(job, { status: "running", started: Date.now(), position: 0 });
        changed(job);
      } else if (evt.type === "progress") {
        const p = { value: evt.value, max: evt.max, at: Date.now() };
        progress.set(job.id, p);
        if (job.status !== "running") {
          Object.assign(job, { status: "running", started: job.started || Date.now() });
          store.touch();
        }
        emit("progress", { id: job.id, ...p });
      } else if (evt.type === "preview") emit("preview", { id: job.id, at: Date.now() });
      else if (evt.type === "settle") setTimeout(() => settle(job), 150);
    },
    async cancel(id) {
      const job = find(id);
      if (!job) return null;
      if (!ACTIVE.has(job.status)) return publicJob(job);
      const q = await comfy.queue().catch(() => ({}));
      const running = (q.queue_running || []).some((x) => x[1] === id);
      if (running) await comfy.interrupt(id).catch(() => {});
      else await comfy.removeQueued([id]).catch(() => {});
      Object.assign(job, { status: "cancelled", finished: Date.now() });
      progress.delete(id);
      changed(job);
      return publicJob(job);
    },
    remove(id) {
      const before = list().length;
      store.get().list = list().filter((j) => j.id !== id);
      if (list().length === before) return false;
      store.touch();
      fsp.rm(path.join(flowDir, id + ".json"), { force: true }).catch(() => {});
      emit("removed", { id });
      return true;
    },
    star(id, on) {
      const job = find(id);
      if (!job) return null;
      job.starred = !!on;
      changed(job);
      return publicJob(job);
    },
    resume: schedule,
    flush: () => store.flush(),
  };
}
