// UI work without a GPU: starts the mock ComfyUI and Wire Studio pointed at it.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockComfy } from "./mock-comfy.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mock = await startMockComfy({ port: Number(process.env.MOCK_PORT || 8199), stepMs: 220, steps: 14 });
console.log("Mock ComfyUI", mock.url);
const child = spawn(process.execPath, [path.join(root, "server.mjs")], {
  stdio: "inherit",
  env: { ...process.env, COMFY_URL: mock.url, WIRE_DATA: process.env.WIRE_DATA || path.join(root, "data-mock") },
});
const stop = () => {
  child.kill("SIGTERM");
  mock.close().then(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
