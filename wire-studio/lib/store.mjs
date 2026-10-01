// Small persistent JSON stores: read once at startup (synchronously, so the first request is
// instant), kept in memory, written back debounced and atomically (temp file + rename, the
// previous version kept as .bak and used if the main file is ever damaged).
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const stores = new Set();

function readJSON(file) {
  for (const candidate of [file, file + ".bak"]) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch {}
  }
  return null;
}

export function createStore(file, initial, { delay = 200 } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const loaded = readJSON(file);
  let data = loaded && typeof loaded === "object" ? { ...structuredClone(initial), ...loaded } : structuredClone(initial);
  let timer = null;
  let dirty = false;
  let chain = Promise.resolve();
  const write = async () => {
    if (!dirty) return;
    dirty = false;
    const tmp = file + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(data));
    try {
      await fsp.rename(file, file + ".bak");
    } catch {}
    await fsp.rename(tmp, file);
  };
  const store = {
    get: () => data,
    set(next) {
      data = next;
      store.touch();
      return data;
    },
    update(fn) {
      fn(data);
      store.touch();
      return data;
    },
    touch() {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => store.flush(), delay);
      timer.unref?.();
    },
    flush() {
      clearTimeout(timer);
      chain = chain.then(write).catch((e) => console.error(`Could not save ${path.basename(file)}: ${e.message}`));
      return chain;
    },
  };
  stores.add(store);
  return store;
}

export const flushAll = () => Promise.all([...stores].map((s) => s.flush()));
