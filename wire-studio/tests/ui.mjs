// Browser regression run (desktop + phone) against the mock ComfyUI.
//   npm i --no-save playwright-core && npm run test:ui
// Uses CHROMIUM_PATH if set, else Playwright's own browser. Screenshots go to tests/output/.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startMockComfy, makePNG } from "./mock-comfy.mjs";

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error("playwright-core is not installed. Run: npm i --no-save playwright-core");
  process.exit(2);
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "tests", "output");
await fs.mkdir(out, { recursive: true });
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "wire-ui-"));
const portrait = path.join(tmp, "portrait.png");
await fs.writeFile(portrait, makePNG(832, 1216, 11));
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

const mock = await startMockComfy({ stepMs: 150, steps: 10 });
const port = await freePort();
const server = spawn(process.execPath, [path.join(root, "server.mjs")], { env: { ...process.env, PORT: String(port), COMFY_URL: mock.url, WIRE_DATA: path.join(tmp, "data") }, stdio: "inherit" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(base + "/api/health")).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 50));
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["✓", name]);
  } catch (e) {
    results.push(["✗", name + ": " + e.message.split("\n")[0]]);
  }
}
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = (n) => page.screenshot({ path: path.join(out, n + ".png") });
  await page.goto(base);
  await page.waitForSelector(".panel-head h1");

  await check("families each show only their own tasks", async () => {
    await page.click(".family:has-text('Anima')");
    assert.equal(await page.locator(".task:has-text('Smart Edit')").count(), 0);
    assert.equal(await page.locator(".task.off:has-text('Face Swap')").count(), 1);
    await page.click(".family:has-text('Krea 2')");
    assert.equal(await page.locator(".task:has-text('Smart Edit')").count(), 1);
    await page.click(".task:has-text('ControlNet')");
    const kinds = await page.locator(".field:has(label:text-is('Control type')) option").allTextContents();
    assert.deepEqual(kinds, ["Depth"]);
  });
  await check("Anima Img2Img + Control: control types and only control patches are offered", async () => {
    await page.click(".family:has-text('Anima')");
    await page.click(".task:has-text('Img2Img + Control')");
    const kinds = await page.locator(".field:has(label:text-is('Keep from the source')) option").allTextContents();
    assert.deepEqual(kinds, ["Line art", "Canny edges", "Scribble", "Grayscale (tones)", "Depth", "Pose (weak)"]);
    await page.click("details.advanced summary:has-text('Advanced')");
    const patches = await page.locator(".field:has(label:text-is('Control patch')) option").allTextContents();
    assert.ok(patches.includes("anima-lllite-any-test-like-v2") && !patches.some((p) => /inpainting/.test(p)), patches.join());
    await page.click("details.advanced summary:has-text('Advanced')");
  });
  await check("Z-Image control offers the modes of the installed Union patches and a Control model picker", async () => {
    await page.click(".family:has-text('Z-Image')");
    await page.click(".task:has-text('ControlNet')");
    const kinds = await page.locator(".field:has(label:text-is('Control type')) option").allTextContents();
    assert.deepEqual(kinds, ["Canny edges", "Soft edge (HED)", "Depth", "Pose (skeleton)", "Straight lines (M-LSD)", "Scribble", "Gray (tones)"]);
    await page.click("details.advanced summary:has-text('Advanced')");
    const models = await page.locator(".field:has(label:text-is('Control model')) option").allTextContents();
    assert.ok(models.includes("Z-Image-Turbo-Fun-Controlnet-Union-2.1-lite-2602-8steps") && !models.some((m) => /Tile/.test(m)), models.join());
    await page.click("details.advanced summary:has-text('Advanced')");
  });
  await check("generate shows live progress, then the result", async () => {
    await page.click(".family:has-text('Anima')");
    await page.click(".task:has-text('Text to Image')");
    await page.fill("textarea.prompt", "masterpiece, best quality, 1girl, silver hair, night city");
    await page.click("#run");
    await page.waitForSelector(".progress-card");
    await page.waitForSelector("[data-progress] [data-label]:has-text('Step')");
    await shot("progress");
    await page.waitForSelector(".canvas-wrap img.checker", { timeout: 20000 });
    await shot("result");
  });
  await check("inpaint: upload, paint, run, before/after compare", async () => {
    await page.click(".family:has-text('SDXL')");
    await page.click(".task:has-text('Inpaint')");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click(".drop-hint button:has-text('Upload')")]);
    await chooser.setFiles(portrait);
    await page.waitForSelector(".painter");
    assert.ok(await page.isDisabled("#run") === false);
    await page.click("#run");
    await page.waitForSelector(".toast:has-text('Paint the area')");
    const box = await page.locator(".painter").boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) await page.mouse.move(box.x + box.width * (0.4 + i * 0.02), box.y + box.height * 0.35);
    await page.mouse.up();
    await page.waitForSelector(".notice:has-text('Area painted')");
    await page.fill("textarea.prompt", "a red scarf");
    await shot("inpaint-mask");
    await page.click("#run");
    await page.waitForSelector(".compare", { timeout: 20000 });
    await shot("inpaint-compare");
  });
  await check("pose output size follows the reference", async () => {
    await page.click(".family:has-text('Z-Image')");
    await page.click(".task:has-text('Pose')");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click(".slot button:has-text('Upload')")]);
    await chooser.setFiles(portrait);
    await page.waitForSelector(".slot.filled");
    assert.equal(await page.textContent(".field:has(label:has-text('Size')) .value"), "832 × 1216");
  });
  await check("model presets, LoRA picker and workflow export", async () => {
    await page.click(".task:has-text('Text to Image')");
    await page.selectOption(".field:has(label:text-is('Model')) select", "z_image_bf16.safetensors");
    await page.waitForSelector(".toast:has-text('Base settings')");
    await page.click("button:has-text('Add LoRA')");
    await page.click(".menu button:has-text('realism_zit_v1')");
    await page.fill("textarea.prompt", "a lighthouse at dawn");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("button:has-text('Export workflow')")]);
    const wf = JSON.parse(await fs.readFile(await dl.path(), "utf8"));
    const types = Object.values(wf).map((n) => n.class_type);
    assert.ok(types.includes("LoraLoaderModelOnly") && types.includes("ModelSamplingAuraFlow"));
    assert.equal(Object.values(wf).find((n) => n.class_type === "KSampler").inputs.steps, 25);
  });
  await check("cancel a running job", async () => {
    await page.click("#run");
    await page.waitForSelector(".progress-card");
    await page.click(".progress-card button:has-text('Cancel')");
    await page.waitForSelector(".empty h3:has-text('Cancelled')");
  });
  await check("use a result as input, reuse settings, remove background", async () => {
    await page.click(".family:has-text('Anima')");
    await page.click(".task:has-text('Text to Image')");
    await page.click(".strip .thumb >> nth=0");
    await page.click(".stage-head button:has-text('Use as input')");
    await page.click(".menu button:has-text('Upscale')");
    await page.waitForSelector(".panel-head h1:has-text('Upscale')");
    await page.waitForSelector(".slot.filled");
    await page.click("#gallery-button");
    await page.click(".gallery-grid button >> nth=0");
    await page.click(".lightbox button:has-text('Reuse settings')");
    await page.waitForSelector(".toast:has-text('Settings restored')");
    await page.click(".family:has-text('Anima')");
    await page.click(".task:has-text('Text to Image')");
    await page.click(".stage-head button:has-text('Use as input')");
    await page.click(".menu button:has-text('Remove background')");
    await page.waitForSelector(".lightbox:has-text('Remove background')", { timeout: 20000 });
    await page.keyboard.press("Escape");
  });
  await check("setup shows readiness and fix instructions", async () => {
    await page.click("#setup-button");
    await page.click(".matrix tr:has-text('Face Swap') td:nth-child(2) button");
    await page.waitForSelector(".card:has-text('Anima · Face Swap')");
    await shot("setup");
    // Each model requirement names the suggested file, its folder and the installed file used.
    await page.click(".matrix tr:has-text('Inpaint') td:nth-child(4) button");
    const detail = page.locator(".card:has-text('Z-Image · Inpaint')");
    await detail.waitFor();
    const text = await detail.innerText();
    for (const want of ["Suggested: z_image_turbo_bf16.safetensors in models/diffusion_models/z-image/turbo/", "Using models/diffusion_models/z_image_turbo_bf16.safetensors", "Using models/model_patches/Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors"]) assert.ok(text.includes(want), want);
  });
  await check("setup lists suggested models and LoRAs per family, found or missing", async () => {
    const tab = page.locator("#suggested button[role=tab]:has-text('Krea 2')");
    await tab.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => document.querySelector(".sheet-body").scrollTop);
    assert.ok(before > 0);
    await tab.click();
    assert.ok(Math.abs((await page.evaluate(() => document.querySelector(".sheet-body").scrollTop)) - before) < 4, "scroll is kept");
    const krea = await page.locator("#suggested").innerText();
    for (const want of ["krea2_turbo_fp8_scaled.safetensors", "Installed: models/diffusion_models/krea2_turbo_fp8_scaled.safetensors", "Goes in models/loras/krea2/control/", "krea2_turbo_int8_convrot.safetensors", "Not installed"]) assert.ok(krea.includes(want), want);
    await page.locator("#suggested label.check input").check();
    const missing = await page.locator("#suggested").innerText();
    assert.ok(missing.includes("krea2_turbo_int8_convrot.safetensors") && !missing.includes("krea2_turbo_fp8_scaled.safetensors"), "only missing files are listed");
    await page.locator("#suggested label.check input").uncheck();
    await page.locator("#library summary:has-text('Other model families')").click();
    assert.ok((await page.locator("#library").innerText()).includes("FLUX/flux_realism_lora.safetensors"));
    await page.locator("#suggested").screenshot({ path: path.join(out, "setup-suggested.png") });
    await page.keyboard.press("Escape");
  });
  await check("form values survive a reload", async () => {
    await page.click(".family:has-text('Z-Image')");
    await page.click(".task:has-text('Text to Image')");
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForSelector(".panel-head h1");
    assert.equal(await page.inputValue("textarea.prompt"), "a lighthouse at dawn");
    assert.equal(await page.locator(".lora").count(), 1);
  });
  await check("phone layout has no horizontal scroll", async () => {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, colorScheme: "light" });
    await phone.goto(base);
    await phone.waitForSelector(".panel-head h1");
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, "overflow " + overflow);
    await phone.click("#setup-button");
    await phone.locator("#suggested").scrollIntoViewIfNeeded();
    const wide = await phone.evaluate(() => { const b = document.querySelector(".sheet-body"); return b.scrollWidth - b.clientWidth; });
    assert.ok(wide <= 1, "setup overflow " + wide);
    await phone.locator("#suggested").screenshot({ path: path.join(out, "phone-suggested.png") });
    await phone.keyboard.press("Escape");
    await phone.screenshot({ path: path.join(out, "phone.png") });
  });
  await check("no page errors", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  server.kill("SIGTERM");
  await mock.close();
  await fs.rm(tmp, { recursive: true, force: true });
}
for (const [mark, name] of results) console.log(mark, name);
const failed = results.filter(([m]) => m === "✗").length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed · screenshots in tests/output/`);
process.exit(failed ? 1 : 0);
