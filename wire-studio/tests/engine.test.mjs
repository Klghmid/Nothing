import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkflow, buildUtility, readiness, readInventory, suggestions, FAMILIES, schema } from "../engine/index.mjs";
import { classify, variantOf } from "../engine/inventory.mjs";
import { objectInfo, sampleParams, CUSTOM_NODES, FILES } from "./fixtures.mjs";

const info = objectInfo();
const ctx = { info, inv: readInventory(info) };
const types = (prompt) => Object.values(prompt).map((n) => n.class_type);
const nodesOf = (prompt, type) => Object.values(prompt).filter((n) => n.class_type === type);

// Follow a link back to the loader that produced it.
function origin(prompt, link, seen = new Set()) {
  const node = prompt[link[0]];
  if (!node || seen.has(link[0])) return [];
  seen.add(link[0]);
  if (/Loader|CheckpointLoaderSimple/.test(node.class_type) && !/LoraLoader/i.test(node.class_type)) return [node];
  const upstream = ["model", "clip", "vae", "conditioning", "positive", "negative"].map((k) => node.inputs[k]).filter((v) => Array.isArray(v));
  return upstream.flatMap((l) => origin(prompt, l, seen));
}
const LOADERS = {
  anima: (n) => (n.class_type === "UNETLoader" && /anima/i.test(n.inputs.unet_name)) || (n.class_type === "CLIPLoader" && n.inputs.type === "stable_diffusion") || (n.class_type === "VAELoader" && /qwen_image_vae/.test(n.inputs.vae_name)),
  sdxl: (n) => n.class_type === "CheckpointLoaderSimple",
  zimage: (n) => (n.class_type === "UNETLoader" && /z_image/i.test(n.inputs.unet_name)) || (n.class_type === "CLIPLoader" && n.inputs.type === "lumina2") || (n.class_type === "VAELoader" && n.inputs.vae_name === "ae.safetensors"),
  krea2: (n) => (n.class_type === "UNETLoader" && /krea2/i.test(n.inputs.unet_name)) || (n.class_type === "CLIPLoader" && n.inputs.type === "krea2") || (n.class_type === "VAELoader" && /qwen_image_vae/.test(n.inputs.vae_name)),
};

test("Setup names the suggested file and the installed file used for each requirement", () => {
  const ready = readiness(ctx);
  const item = (family, task, key) => ready[family][task].items.find((n) => n.help?.key === key);
  const union21 = item("zimage", "inpaint", "zimageUnion21");
  assert.equal(union21.help.folder, "model_patches");
  assert.deepEqual(union21.found, ["Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors"], "the newest full 2.x patch");
  assert.ok(item("zimage", "inpaint", "zimageTurbo").found.includes("z_image_turbo_bf16.safetensors"));
  assert.deepEqual(item("anima", "generate", "animaTurbo").found, ["anima-turbo-lora-v0.2.safetensors"]);
  assert.deepEqual(item("sdxl", "inpaint", "sdxlUnion").found, ["SDXL/controlnet-union-sdxl-1.0-promax.safetensors"]);
  assert.deepEqual(item("krea2", "control", "krea2Depth").found, ["krea2/krea2_depth_control_lora.safetensors"]);

  const list = suggestions(ctx, ready);
  const row = (file) => list.find((m) => m.file === file);
  assert.deepEqual([row("z_image_turbo_bf16.safetensors").status, row("z_image_turbo_bf16.safetensors").found], ["found", ["z_image_turbo_bf16.safetensors"]]);
  assert.equal(row("qwen_3_4b_fp8_mixed.safetensors").status, "missing");
  assert.equal(row("anima-preview3-base.safetensors").status, "missing");
  assert.deepEqual(row("controlnet-union-sdxl-1.0-promax.safetensors").found, ["SDXL/controlnet-union-sdxl-1.0-promax.safetensors"], "found in a sub-folder");
  assert.equal(row("sd_xl_base_1.0.safetensors").status, "covered", "any SDXL checkpoint does the job");
  assert.ok(row("sd_xl_base_1.0.safetensors").found.includes("Illustrious-XL-v2.0.safetensors"));
  const turbo = row("your Anima Turbo / distilled models");
  assert.equal(turbo.status, "found");
  assert.deepEqual(turbo.found.sort(), ["Anima/anima_turbo_int8.safetensors", "Anima_Turbo/terraRisingUnity_v301.safetensors"]);
  assert.deepEqual(row("your Krea 2 depth Control-LoRA, any file name").found, ["krea2/krea2_depth_control_lora.safetensors"]);
  assert.deepEqual(row("your Anima LoRAs").found, ctx.inv.families.anima.loras);
  assert.equal(row("inswapper_128.onnx").status, "found");
  assert.equal(row("codeformer-v0.1.0.pth").status, "found");
  assert.equal(list.filter((m) => m.file === "qwen_image_vae.safetensors").every((m) => m.status === "found"), true, "shared by Anima and Krea 2");
  const lean = objectInfo({ checkpoints: [], unets: [], loras: [], clips: [], vaes: [], patches: [], controlnets: [], upscalers: [], detectors: [], inputs: ["example.png"] });
  const leanCtx = { info: lean, inv: readInventory(lean) };
  assert.ok(suggestions(leanCtx, readiness(leanCtx)).filter((m) => m.family !== "Shared").every((m) => m.status === "missing" && !m.found.length));
});

test("Krea 2 edit LoRAs: loras/krea2/editor/ with any name, never in the LoRA picker", () => {
  const files = (loras) => {
    const i = objectInfo({ ...FILES, loras });
    return readInventory(i).families.krea2;
  };
  const k = files(["krea2/editor/my_edit_v2.safetensors", "krea2_identity_edit_v1_2.safetensors", "krea2/styles/ink.safetensors", "krea2/control/depth_v1.safetensors"]);
  assert.equal(k.editLora, "krea2/editor/my_edit_v2.safetensors", "the editor/ folder wins");
  assert.deepEqual(k.editLoras.sort(), ["krea2/editor/my_edit_v2.safetensors", "krea2_identity_edit_v1_2.safetensors"]);
  assert.deepEqual(k.loras, ["krea2/styles/ink.safetensors"], "edit and control LoRAs stay out of the picker");
  assert.deepEqual(k.controlLoras, ["krea2/control/depth_v1.safetensors"]);
  assert.equal(files(["Krea2/Edit/identity_edit_v1_3.safetensors", "krea2_identity_edit_v1_2.safetensors"]).editLora, "Krea2/Edit/identity_edit_v1_3.safetensors");
  assert.equal(files(["krea2_identity_edit_v1_1.safetensors", "krea2_identity_edit_v1_10.safetensors"]).editLora, "krea2_identity_edit_v1_10.safetensors", "highest version");
  const ictx = { info: objectInfo({ ...FILES, loras: ["krea2/editor/my_edit_v2.safetensors"] }) };
  ictx.inv = readInventory(ictx.info);
  const prompt = buildWorkflow("krea2", "edit", sampleParams("edit"), ictx).prompt;
  assert.deepEqual(nodesOf(prompt, "LoraLoaderModelOnly").map((n) => n.inputs.lora_name), ["krea2/editor/my_edit_v2.safetensors"]);
});

test("family and type come from folders at any depth", () => {
  const f = ctx.inv.families;
  assert.ok(f.sdxl.models.includes("SDXL/turbo/dreamshaperMix_v8.safetensors") && !f.sdxl.unverified.includes("SDXL/turbo/dreamshaperMix_v8.safetensors"), "SDXL folder decides");
  assert.ok(f.sdxl.loras.includes("SDXL/styles/watercolor.safetensors"));
  assert.ok(f.zimage.loras.includes("z-image/people/portrait_v2.safetensors"));
  assert.equal(f.anima.variants["Anima_Turbo/terraRisingUnity_v301.safetensors"], "turbo", "a word in the folder name counts");
  assert.equal(f.anima.variants["anima-base-v1.0.safetensors"], "regular");
  assert.equal(f.sdxl.variants["SDXL/turbo/dreamshaperMix_v8.safetensors"], "turbo");
  assert.equal(f.zimage.variants["z-image/regular/my_finetune.safetensors"], "regular");
  assert.equal(f.zimage.variants["z_image_turbo_bf16.safetensors"], "turbo");
  assert.equal(f.krea2.variants["krea2_raw_bf16.safetensors"], "regular");
  assert.equal(variantOf("SDXL/regular/dreamshaperXL_lightning.safetensors"), "regular", "a folder beats the file name");
  assert.equal(variantOf("SDXL-Lightning/x.safetensors"), "turbo");
  assert.deepEqual(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.auto])), {
    anima: "anima-base-v1.0.safetensors", sdxl: "Illustrious-XL-v2.0.safetensors", zimage: "z_image_turbo_bf16.safetensors", krea2: "krea2_turbo_fp8_scaled.safetensors",
  });
  assert.deepEqual(ctx.inv.misplaced, [{ name: "Z-Image/turbo/z_image_turbo_aio.safetensors", family: "zimage", folder: "checkpoints", should: "diffusion_models" }]);
  assert.ok(!f.sdxl.models.includes("Z-Image/turbo/z_image_turbo_aio.safetensors"), "a misplaced Z-Image file is never offered as SDXL");
  for (const id of Object.keys(f)) assert.deepEqual(Object.keys(schema().families[id].presets).sort(), ["regular", "turbo"]);
});

test("the model type sets the server-side defaults", () => {
  const base = buildWorkflow("zimage", "generate", { prompt: "x", model: "z-image/regular/my_finetune.safetensors" }, ctx).prompt;
  const ks = nodesOf(base, "KSampler")[0].inputs;
  assert.deepEqual([ks.steps, ks.cfg], [25, 4]);
  assert.equal(nodesOf(base, "CLIPTextEncode").length, 2);
  const raw = buildWorkflow("krea2", "generate", { prompt: "x", model: "krea2_raw_bf16.safetensors" }, ctx).prompt;
  assert.equal(nodesOf(raw, "KSampler")[0].inputs.steps, 52);
});

test("inventory sorts every model into exactly one family", () => {
  const f = ctx.inv.families;
  assert.deepEqual(f.anima.models, ["anima-base-v1.0.safetensors", "Anima/anima_turbo_int8.safetensors", "Anima_Turbo/terraRisingUnity_v301.safetensors"]);
  assert.deepEqual(f.zimage.models, ["z_image_turbo_bf16.safetensors", "z_image_bf16.safetensors", "z-image/regular/my_finetune.safetensors"]);
  assert.deepEqual(f.krea2.models, ["krea2_turbo_fp8_scaled.safetensors", "krea2_raw_bf16.safetensors"], "FLUX.1 Krea dev is not Krea 2");
  assert.ok(f.sdxl.models.includes("Illustrious-XL-v2.0.safetensors"));
  assert.ok(f.sdxl.models.includes("mystery_mix_v3.safetensors") && f.sdxl.unverified.includes("mystery_mix_v3.safetensors"));
  for (const bad of ["sdpose_wholebody_fp16.safetensors", "sd15/dreamshaper_8.safetensors", "sd_xl_refiner_1.0.safetensors"]) assert.ok(!f.sdxl.models.includes(bad), bad);
  assert.deepEqual(f.anima.loras, ["Anima/ANIMA_DETAILER_zoda_anima_v2.safetensors", "anima/characters/miku_v3.safetensors", "AnimaLoRA/style_x.safetensors"]);
  assert.equal(f.anima.turboLora, "anima-turbo-lora-v0.2.safetensors");
  assert.deepEqual(f.krea2.controlLoras, ["krea2/krea2_depth_control_lora.safetensors", "krea2/control/krea2_turbo_openpose_controlnet.safetensors", "krea2/krea2_unidepth_depth_exp_v1.safetensors"]);
  // The pose and UniDepth LoRAs need their own nodes; they are listed apart from the depth Control-LoRA.
  assert.deepEqual(f.krea2.poseLoras, ["krea2/control/krea2_turbo_openpose_controlnet.safetensors"]);
  assert.deepEqual(f.krea2.unidepthLoras, ["krea2/krea2_unidepth_depth_exp_v1.safetensors"]);
  assert.equal(f.krea2.editLora, "krea2_identity_edit_v1_2.safetensors");
  assert.deepEqual(f.krea2.loras, ["krea2_darkbrush.safetensors"]);
  assert.deepEqual(ctx.inv.unsortedLoras, ["detail_slider.safetensors"]);
  assert.deepEqual(ctx.inv.otherLoras, ["FLUX/flux_realism_lora.safetensors", "Wan2.2/lightx2v_i2v_14B.safetensors"], "other families are listed apart, not as unsorted");
  assert.ok(ctx.inv.otherModels.includes("flux1-krea-dev.safetensors") && ctx.inv.otherModels.includes("sd15/dreamshaper_8.safetensors"));
  assert.deepEqual(f.sdxl.controlnets, ["SDXL/controlnet-union-sdxl-1.0-promax.safetensors", "sdxl/diffusers_xl_canny_full.safetensors"]);
  assert.equal(classify("animagine-xl-4.0.safetensors"), "sdxl", "Animagine is SDXL, not Anima");
  for (const n of ["sam3.1_multiplex_fp16.safetensors", "sam3.safetensors", "depth_anything_3_mono_large.safetensors", "birefnet.safetensors"]) assert.equal(classify(n), "other", `${n} is not an SDXL checkpoint`);
  assert.equal(classify("detail_slider.safetensors", { "detail_slider.safetensors": "sdxl" }), "sdxl", "Library assignment wins");
});

for (const [familyId, fam] of Object.entries(FAMILIES)) {
  for (const [taskId, task] of Object.entries(fam.tasks)) {
    if (task.unavailable) {
      test(`${familyId}/${taskId} is refused with a reason`, () => assert.throws(() => buildWorkflow(familyId, taskId, sampleParams(taskId), ctx), /Not offered/));
      continue;
    }
    test(`${familyId}/${taskId} builds a valid, family-pure workflow`, () => {
      const needsMask = task.fields.some((f) => f.type === "mask" && !f.optional);
      const base = { ...sampleParams(taskId), ...(needsMask ? { mask: "mask.png" } : {}), ...(task.example || {}) };
      // The test parameters, then every exported variant (each method / option the task offers).
      for (const params of [base, ...(task.variants || []).map((v) => ({ ...base, ...v.params }))]) checkPure(familyId, taskId, buildWorkflow(familyId, taskId, params, ctx).prompt);
    });
  }
}

function checkPure(familyId, taskId, prompt) {
  assert.ok(nodesOf(prompt, "SaveImage").length === 1);
  for (const [id, n] of Object.entries(prompt)) {
    const spec = info[n.class_type];
    assert.ok(spec, `${n.class_type} exists`);
    for (const k of Object.keys(spec.input.required)) assert.ok(k in n.inputs, `${id} ${n.class_type}.${k} is set`);
    for (const v of Object.values(n.inputs)) if (Array.isArray(v) && typeof v[0] === "string") assert.ok(prompt[v[0]], `${id} links to an existing node`);
  }
  // Every sampler / detail pass is wired only to this family's loaders.
  for (const s of Object.values(prompt).filter((n) => ["KSampler", "FaceDetailer", "UltimateSDUpscale"].includes(n.class_type))) {
    const loaders = ["model", "positive", "negative", "vae", "clip"].flatMap((k) => (Array.isArray(s.inputs[k]) ? origin(prompt, s.inputs[k]) : []));
    assert.ok(loaders.length, `${s.class_type} has loaders`);
    for (const l of loaders) assert.ok(LOADERS[familyId](l), `${familyId}/${taskId}: ${l.class_type} ${JSON.stringify(l.inputs)} belongs to ${familyId}`);
  }
}

test("Anima: LLLite inpaint patch with the painted mask, masked latent, soft paste-back", () => {
  const { prompt } = buildWorkflow("anima", "inpaint", sampleParams("inpaint"), ctx);
  const lllite = nodesOf(prompt, "AnimaLLLiteApply")[0];
  assert.ok(lllite.inputs.mask && nodesOf(prompt, "ModelPatchLoader")[0].inputs.name === "anima-lllite-inpainting-v2.safetensors");
  assert.ok(types(prompt).includes("SetLatentNoiseMask") && types(prompt).includes("ImageBlur") && types(prompt).includes("ImageCompositeMasked"));
  const clip = nodesOf(prompt, "CLIPLoader")[0].inputs;
  assert.equal(clip.type, "stable_diffusion");
  assert.equal(nodesOf(prompt, "KSampler")[0].inputs.sampler_name, "euler");
});

test("Anima: turbo uses the official LoRA; pose and line-art use their own LLLite patches", () => {
  const turbo = buildWorkflow("anima", "generate", { ...sampleParams("generate"), turbo: true, steps: 8, cfg: 1 }, ctx).prompt;
  assert.ok(nodesOf(turbo, "LoraLoaderModelOnly").some((n) => n.inputs.lora_name === "anima-turbo-lora-v0.2.safetensors"));
  assert.equal(nodesOf(turbo, "KSampler")[0].inputs.steps, 8);
  const pose = buildWorkflow("anima", "pose", sampleParams("pose"), ctx).prompt;
  assert.equal(nodesOf(pose, "ModelPatchLoader")[0].inputs.name, "anima-lllite-pose-1.safetensors");
  assert.ok(types(pose).includes("DWPreprocessor"));
  const line = buildWorkflow("anima", "control", { ...sampleParams("control"), kind: "lineart" }, ctx).prompt;
  assert.equal(nodesOf(line, "ModelPatchLoader")[0].inputs.name, "anima-lllite-any-test-like-v2.safetensors");
  assert.ok(types(line).includes("ImageInvert"), "line maps become black on white for the Anima any-test model");
});

test("SDXL: inpaint uses Union ProMax repaint, never VAEEncodeForInpaint on a regular checkpoint", () => {
  const { prompt } = buildWorkflow("sdxl", "inpaint", { ...sampleParams("inpaint"), model: "Illustrious-XL-v2.0.safetensors" }, ctx);
  assert.equal(nodesOf(prompt, "SetUnionControlNetType")[0].inputs.type, "repaint");
  assert.ok(!types(prompt).includes("VAEEncodeForInpaint"));
  assert.ok(types(prompt).includes("SetLatentNoiseMask"));
});

test("SDXL: pose picks OpenPose mode on the Union net; canny prefers the dedicated canny net", () => {
  const pose = buildWorkflow("sdxl", "pose", sampleParams("pose"), ctx).prompt;
  assert.equal(nodesOf(pose, "SetUnionControlNetType")[0].inputs.type, "openpose");
  const canny = buildWorkflow("sdxl", "control", { ...sampleParams("control"), kind: "canny" }, ctx).prompt;
  assert.equal(nodesOf(canny, "ControlNetLoader")[0].inputs.control_net_name, "sdxl/diffusers_xl_canny_full.safetensors");
  assert.ok(!types(canny).includes("SetUnionControlNetType"));
});

test("Z-Image: turbo template settings and Fun Union control / inpaint", () => {
  const gen = buildWorkflow("zimage", "generate", sampleParams("generate"), ctx).prompt;
  const ks = nodesOf(gen, "KSampler")[0].inputs;
  assert.deepEqual([ks.steps, ks.cfg, ks.sampler_name, ks.scheduler], [8, 1, "res_multistep", "simple"]);
  assert.ok(types(gen).includes("ConditioningZeroOut") && types(gen).includes("EmptySD3LatentImage"));
  assert.equal(nodesOf(gen, "ModelSamplingAuraFlow")[0].inputs.shift, 3);
  const base = buildWorkflow("zimage", "generate", { ...sampleParams("generate"), model: "z_image_bf16.safetensors", steps: 25, cfg: 4 }, ctx).prompt;
  assert.ok(nodesOf(base, "CLIPTextEncode").length === 2, "Base model uses a real negative prompt");
  const inpaint = buildWorkflow("zimage", "inpaint", sampleParams("inpaint"), ctx).prompt;
  const fun = nodesOf(inpaint, "ZImageFunControlnet")[0].inputs;
  assert.ok(fun.inpaint_image && fun.mask);
  assert.match(nodesOf(inpaint, "ModelPatchLoader")[0].inputs.name, /Union-2\.1/);
  const pose = buildWorkflow("zimage", "pose", sampleParams("pose"), ctx).prompt;
  assert.ok(nodesOf(pose, "ZImageFunControlnet")[0].inputs.image);
  // The shift node comes after the control patch (official template order).
  const shift = nodesOf(pose, "ModelSamplingAuraFlow")[0];
  assert.equal(pose[shift.inputs.model[0]].class_type, "ZImageFunControlnet");
});

test("Krea 2: official turbo settings, RAW defaults, style reference and depth control", () => {
  const gen = buildWorkflow("krea2", "generate", sampleParams("generate"), ctx).prompt;
  assert.equal(nodesOf(gen, "CLIPLoader")[0].inputs.type, "krea2");
  const ks = nodesOf(gen, "KSampler")[0].inputs;
  assert.deepEqual([ks.steps, ks.cfg, ks.sampler_name, ks.scheduler], [8, 1, "euler", "simple"]);
  const raw = buildWorkflow("krea2", "generate", { ...sampleParams("generate"), model: "krea2_raw_bf16.safetensors" }, ctx).prompt;
  assert.deepEqual([nodesOf(raw, "KSampler")[0].inputs.steps, nodesOf(raw, "KSampler")[0].inputs.cfg], [52, 4]);
  const style = buildWorkflow("krea2", "generate", { ...sampleParams("generate"), style1: "style.png" }, ctx).prompt;
  for (const t of ["TextEncodeQwenImageEditPlus", "FluxKontextMultiReferenceLatentMethod", "ModelSamplingFlux"]) assert.ok(types(style).includes(t), t);
  assert.ok(nodesOf(style, "LoraLoaderModelOnly").some((n) => n.inputs.lora_name === "krea2_style_reference.safetensors"));
  const control = buildWorkflow("krea2", "control", sampleParams("control"), ctx).prompt;
  for (const t of ["Krea2ControlLoRALoader", "Krea2ControlImageEncode", "Krea2ControlApply", "DA3Render"]) assert.ok(types(control).includes(t), t);
  assert.ok(!types(control).includes("DepthAnythingV2Preprocessor"), "native Depth Anything 3 wins when its model is installed");
  const noDa3 = objectInfo({ ...FILES, da3: [] });
  const oldDepth = buildWorkflow("krea2", "control", sampleParams("control"), { info: noDa3, inv: readInventory(noDa3) }).prompt;
  assert.ok(types(oldDepth).includes("DepthAnythingV2Preprocessor") && !types(oldDepth).includes("DA3Render"), "else comfyui_controlnet_aux");
  assert.equal(nodesOf(control, "Krea2ControlImageEncode")[0].inputs.channel_mode, "grayscale");
  const inpaint = buildWorkflow("krea2", "inpaint", sampleParams("inpaint"), ctx).prompt;
  assert.ok(types(inpaint).includes("DifferentialDiffusion"));
  const edit = buildWorkflow("krea2", "edit", sampleParams("edit"), ctx).prompt;
  assert.ok(types(edit).includes("Krea2EditModelPatch") && types(edit).includes("Krea2EditGroundedEncode"));
});

test("Krea 2 Style Reference: official graph with up to three references; redraw mode encodes the source", () => {
  const p = { ...sampleParams("style"), style2: "style2.png", style3: "style3.png" };
  const gen = buildWorkflow("krea2", "style", p, ctx).prompt;
  const enc = nodesOf(gen, "TextEncodeQwenImageEditPlus")[0].inputs;
  assert.ok(enc.image1 && enc.image2 && enc.image3 && enc.vae, "three references, VAE for the reference latents");
  assert.equal(nodesOf(gen, "FluxKontextMultiReferenceLatentMethod")[0].inputs.reference_latents_method, "index_timestep_zero");
  assert.ok(types(gen).includes("EmptyLatentImage") && !types(gen).includes("VAEEncode"));
  assert.ok(nodesOf(gen, "LoraLoaderModelOnly").some((n) => n.inputs.lora_name === "krea2_style_reference.safetensors"));
  assert.equal(nodesOf(gen, "KSampler")[0].inputs.denoise, 1);
  const third = buildWorkflow("krea2", "style", { ...p, style2: "" }, ctx).prompt;
  assert.ok(!nodesOf(third, "TextEncodeQwenImageEditPlus")[0].inputs.image3, "a third reference needs a second one");
  const redraw = buildWorkflow("krea2", "style", { ...p, mode: "img2img", denoise: 0.6 }, ctx).prompt;
  const ks = nodesOf(redraw, "KSampler")[0].inputs;
  assert.equal(ks.denoise, 0.6);
  assert.equal(redraw[ks.latent_image[0]].class_type, "VAEEncode", "redraw starts from the source");
  const shift = nodesOf(redraw, "ModelSamplingFlux")[0].inputs;
  assert.deepEqual([shift.width, shift.height], [832, 1216], "shift follows the source size");
  assert.throws(() => buildWorkflow("krea2", "style", { ...sampleParams("style"), style1: "" }, ctx), /style reference/);
  const noLora = objectInfo({ ...FILES, loras: FILES.loras.filter((n) => !/style_reference/.test(n)) });
  assert.throws(() => buildWorkflow("krea2", "style", sampleParams("style"), { info: noLora, inv: readInventory(noLora) }), /krea2_style_reference/);
});

test("Krea 2 depth: Control-LoRA and UniDepth are separate paths with their own LoRAs", () => {
  const lora = buildWorkflow("krea2", "control", sampleParams("control"), ctx).prompt;
  assert.equal(nodesOf(lora, "Krea2ControlLoRALoader")[0].inputs.lora_name, "krea2/krea2_depth_control_lora.safetensors", "never the UniDepth or pose LoRA");
  assert.ok(!types(lora).some((t) => /UniDepth/.test(t)));
  const uni = buildWorkflow("krea2", "control", { ...sampleParams("control"), method: "unidepth", ref1: "a.png", ref2: "b.png", start: 0.5, end: 0.3 }, ctx).prompt;
  assert.ok(!types(uni).some((t) => /^Krea2Control/.test(t)), "UniDepth does not use the Control-LoRA nodes");
  assert.equal(nodesOf(uni, "Krea2UniDepthLoRALoader")[0].inputs.lora_name, "krea2/krea2_unidepth_depth_exp_v1.safetensors");
  const cond = nodesOf(uni, "Krea2UniDepthConditioning")[0].inputs;
  assert.equal(uni[cond.image[0]].inputs.image, "a.png", "reference 1 is the direct image input");
  assert.equal(uni[uni[cond.references[0]].inputs.image[0]].inputs.image, "b.png", "reference 2 goes through the stack");
  assert.ok(cond.start_percent < cond.end_percent, "the window is always valid");
  const ks = nodesOf(uni, "KSampler")[0].inputs;
  const condId = Object.keys(uni).find((id) => uni[id].class_type === "Krea2UniDepthConditioning");
  assert.deepEqual([ks.positive, ks.negative, ks.latent_image], [[condId, 0], [condId, 1], [condId, 2]]);
  assert.equal(uni[ks.model[0]].class_type, "Krea2UniDepthLoRALoader");
  // Only UniDepth installed: it is used without being chosen; neither installed: refused.
  const onlyUni = objectInfo({ ...FILES, loras: FILES.loras.filter((n) => !/depth_control/.test(n)) });
  const octx = { info: onlyUni, inv: readInventory(onlyUni) };
  assert.ok(types(buildWorkflow("krea2", "control", sampleParams("control"), octx).prompt).includes("Krea2UniDepthConditioning"));
  assert.equal(readiness(octx).krea2.control.state, "ready");
  const none = objectInfo({ ...FILES, loras: FILES.loras.filter((n) => !/depth/.test(n)) });
  assert.throws(() => buildWorkflow("krea2", "control", sampleParams("control"), { info: none, inv: readInventory(none) }), /depth Control LoRA/);
  // UniDepth is offered only when its nodes and LoRA are installed.
  assert.equal(ctx.inv.families.krea2.features.unidepth, true);
  const noNodes = objectInfo(FILES, { without: ["Krea2UniDepthConditioning"] });
  assert.equal(readInventory(noNodes).families.krea2.features.unidepth, false);
});

test("Krea 2 Img2Img + Control and depth-guided outpaint size the control to the sampled latent", () => {
  const p = { ...sampleParams("img2img-control"), kind: "depth" };
  const viaLora = buildWorkflow("krea2", "img2img-control", p, ctx).prompt;
  const ks = nodesOf(viaLora, "KSampler")[0].inputs;
  assert.equal(viaLora[ks.latent_image[0]].class_type, "VAEEncode");
  assert.deepEqual(nodesOf(viaLora, "Krea2ControlImageEncode")[0].inputs.latent, ks.latent_image, "control latent matches the source latent");
  assert.equal(ks.denoise, 0.6);
  const viaUni = buildWorkflow("krea2", "img2img-control", { ...p, method: "unidepth" }, ctx).prompt;
  const cond = nodesOf(viaUni, "Krea2UniDepthConditioning")[0].inputs;
  assert.equal(viaUni[cond.target_latent[0]].class_type, "VAEEncode", "the source sets UniDepth's target geometry");
  const out = buildWorkflow("krea2", "outpaint", { ...sampleParams("outpaint"), guide: "depth" }, ctx).prompt;
  const enc = nodesOf(out, "Krea2ControlImageEncode")[0].inputs;
  assert.equal(out[enc.latent[0]].class_type, "SetLatentNoiseMask", "the depth guide matches the padded, masked latent");
  assert.equal(nodesOf(out, "Krea2ControlLoRALoader")[0].inputs.strength, 0.6);
  assert.ok(!types(buildWorkflow("krea2", "outpaint", sampleParams("outpaint"), ctx).prompt).includes("Krea2ControlLoRALoader"), "no guide by default");
});

test("Krea 2 Pose: the OpenPose LoRA through the Ostris Edit nodes, never the depth path", () => {
  const pose = buildWorkflow("krea2", "pose", sampleParams("pose"), ctx).prompt;
  assert.ok(!types(pose).some((t) => /Krea2Control|UniDepth|DepthAnything|DA3/.test(t)), "no depth path");
  const ks = nodesOf(pose, "KSampler")[0].inputs;
  assert.deepEqual([ks.steps, ks.cfg, ks.sampler_name, ks.scheduler], [10, 1, "euler", "simple"], "the published workflow's settings");
  const lora = pose[ks.model[0]];
  assert.equal(lora.class_type, "LoraLoaderModelOnly");
  assert.equal(lora.inputs.lora_name, "krea2/control/krea2_turbo_openpose_controlnet.safetensors");
  assert.equal(pose[lora.inputs.model[0]].class_type, "Krea2OstrisEditModelPatch", "patch, then the LoRA, as published");
  assert.equal(pose[lora.inputs.model[0]].inputs.kv_cache, true);
  for (const side of ["positive", "negative"]) {
    const method = pose[ks[side][0]];
    assert.equal(method.inputs.reference_latents_method, "index_timestep_zero");
    const enc = pose[method.inputs.conditioning[0]];
    assert.equal(enc.class_type, "TextEncodeKrea2OstrisEdit");
    assert.ok(enc.inputs.vae && enc.inputs.image1, `${side} carries the pose map as image 1`);
  }
  assert.ok(types(pose).includes("DWPreprocessor"));
  const skeleton = buildWorkflow("krea2", "pose", { ...sampleParams("pose"), isSkeleton: true, isMap: false }, ctx).prompt;
  assert.ok(!types(skeleton).includes("DWPreprocessor"), "a ready skeleton is used as is");
  const old = buildWorkflow("krea2", "pose", { ...sampleParams("pose"), isMap: true }, ctx).prompt;
  assert.ok(types(old).includes("DWPreprocessor"), "an old saved depth-map switch is not read as a skeleton");
  const fromSource = buildWorkflow("krea2", "pose", { ...sampleParams("pose"), source: "start.png", denoise: 0.7 }, ctx).prompt;
  const fks = nodesOf(fromSource, "KSampler")[0].inputs;
  assert.equal(fromSource[fks.latent_image[0]].class_type, "VAEEncode");
  assert.equal(fks.denoise, 0.7);
  const noPose = objectInfo({ ...FILES, loras: FILES.loras.filter((n) => !/openpose/.test(n)) });
  assert.throws(() => buildWorkflow("krea2", "pose", sampleParams("pose"), { info: noPose, inv: readInventory(noPose) }), /krea2_turbo_openpose_controlnet\.safetensors in models\/loras\/krea2\/control/);
  assert.equal(readiness({ info: noPose, inv: readInventory(noPose) }).krea2.pose.state, "missing");
});

test("Krea 2 safety check: task LoRAs only go to the loaders made for them", async () => {
  const { assertFamily } = await import("../engine/index.mjs");
  const { Graph } = await import("../engine/graph.mjs");
  const g = new Graph({ family: "krea2", info });
  g.add("Krea2UniDepthLoRALoader", { lora_name: "krea2/krea2_depth_control_lora.safetensors" });
  assert.throws(() => assertFamily("krea2", g, ctx.inv), /not a krea2 UniDepth LoRA/);
  const h = new Graph({ family: "sdxl", info });
  h.add("TextEncodeKrea2OstrisEdit", {});
  assert.throws(() => assertFamily("sdxl", h, ctx.inv), /belongs to another family/);
});

test("Background Replace: subject mask, background-only sampling, photo / blur compositing, every family", () => {
  const base = { prompt: "a quiet beach at sunset", seed: 1, image: "photo.png", imageW: 832, imageH: 1216 };
  const nodeOf = (prompt, link) => prompt[link[0]];
  for (const family of ["anima", "sdxl", "zimage", "krea2"]) {
    const gen = buildWorkflow(family, "bg-replace", { ...base, bgMode: "prompt" }, ctx).prompt;
    assert.ok(types(gen).includes("RemoveBackground") && types(gen).includes("InvertMask"), `${family}: subject mask, inverted`);
    const grow = nodesOf(gen, "GrowMask")[0].inputs;
    assert.equal(grow.expand, 4);
    assert.equal(nodeOf(gen, grow.mask).class_type, "InvertMask", `${family}: the sampled area is the background`);
    const noised = [...nodesOf(gen, "SetLatentNoiseMask"), ...nodesOf(gen, "VAEEncodeForInpaint")][0].inputs;
    assert.equal(nodeOf(gen, noised.mask).class_type, "GrowMask", `${family}: only the background is redrawn`);
    const last = Object.values(gen).find((n) => n.class_type === "SaveImage").inputs.images;
    assert.equal(gen[last[0]].class_type, "ImageCompositeMasked", `${family}: the subject is pasted back`);
    assert.equal(nodeOf(gen, gen[last[0]].inputs.destination).inputs.image, "photo.png");
    assert.throws(() => buildWorkflow(family, "bg-replace", { ...base, prompt: "", bgMode: "prompt" }, ctx), /Describe the new background/);
    // A photo: scaled to the subject photo, composited, then a thin edge band is redrawn gently.
    const photo = buildWorkflow(family, "bg-replace", { ...base, bgMode: "image", background: "beach.png" }, ctx).prompt;
    const scaled = nodesOf(photo, "ImageScale").find((n) => photo[n.inputs.image[0]].inputs?.image === "beach.png");
    assert.ok(scaled && scaled.inputs.width === 832 && scaled.inputs.height === 1216, `${family}: background fitted to the photo`);
    assert.equal(nodesOf(photo, "MaskComposite")[0].inputs.operation, "subtract", "edge band");
    assert.equal(nodesOf(photo, "KSampler")[0].inputs.denoise, 0.35);
    assert.throws(() => buildWorkflow(family, "bg-replace", { ...base, bgMode: "image" }, ctx), /background photo/);
    // Blur without the edge blend uses no model at all.
    const blur = buildWorkflow(family, "bg-replace", { ...base, bgMode: "blur", cleanup: false }, ctx).prompt;
    assert.ok(types(blur).includes("ImageBlur") && !types(blur).includes("KSampler") && !types(blur).some((t) => /Loader/.test(t) && t !== "LoadBackgroundRemovalModel"), `${family}: blur is model-free`);
  }
  // Without the native BiRefNet model, ComfyUI-RMBG's mask output (index 1) is used.
  const noNative = objectInfo({ ...FILES, bgRemoval: [] });
  const rmbg = buildWorkflow("sdxl", "bg-replace", { ...base, bgMode: "blur", cleanup: false }, { info: noNative, inv: readInventory(noNative) }).prompt;
  const inv = nodesOf(rmbg, "InvertMask")[0].inputs.mask;
  assert.equal(rmbg[inv[0]].class_type, "BiRefNetRMBG");
  assert.equal(inv[1], 1);
});

test("Reframe: extends to an aspect ratio or exact size through the family's own outpaint", () => {
  const base = { prompt: "", seed: 1, image: "photo.png", imageW: 832, imageH: 1216 };
  for (const family of ["anima", "sdxl", "zimage", "krea2"]) {
    const wide = buildWorkflow(family, "reframe", { ...base, target: "aspect", aspect: "16:9", align: "center" }, ctx).prompt;
    const pad = nodesOf(wide, "ImagePadForOutpaint")[0].inputs;
    assert.ok(pad.left > 0 && pad.right > 0 && pad.top === 0 && pad.bottom === 0, `${family}: grows sideways`);
    assert.ok(Math.abs((832 + pad.left + pad.right) / 1216 - 16 / 9) < 0.01);
    const left = buildWorkflow(family, "reframe", { ...base, target: "aspect", aspect: "16:9", align: "left" }, ctx).prompt;
    assert.equal(nodesOf(left, "ImagePadForOutpaint")[0].inputs.left, 0, `${family}: picture kept at the left`);
    const exact = buildWorkflow(family, "reframe", { ...base, target: "size", width: 1344, height: 768 }, ctx).prompt;
    const last = exact[Object.values(exact).find((n) => n.class_type === "SaveImage").inputs.images[0]];
    assert.deepEqual([last.class_type, last.inputs.width, last.inputs.height], ["ImageScale", 1344, 768], `${family}: exact size`);
    assert.throws(() => buildWorkflow(family, "reframe", { ...base, imageW: 1344, imageH: 756, target: "aspect", aspect: "16:9" }, ctx), /already 16:9/);
    const same = buildWorkflow(family, "reframe", { ...base, imageW: 1024, imageH: 1024, target: "size", width: 768, height: 768 }, ctx).prompt;
    assert.ok(!types(same).includes("KSampler"), `${family}: same shape is only resized`);
  }
  const guided = buildWorkflow("krea2", "reframe", { ...base, target: "aspect", aspect: "16:9", guide: "depth" }, ctx).prompt;
  assert.ok(types(guided).includes("Krea2ControlImageEncode"), "Krea 2 reframe keeps the outpaint depth guide");
});

test("Krea 2 Smart Edit: a second image reaches both the appearance path and the encoder", () => {
  // comfyui-krea2edit's pixel path (vae + source_image) rebuilds its source list from
  // source_image / source_image_b only, so source_latent_b alone would be silently ignored.
  const { prompt } = buildWorkflow("krea2", "edit", { ...sampleParams("edit"), image2: "person.png" }, ctx);
  const patch = nodesOf(prompt, "Krea2EditModelPatch")[0].inputs;
  const loadOf = (link) => prompt[link[0]];
  assert.equal(loadOf(patch.source_image).inputs.image, "example.png");
  assert.equal(loadOf(patch.source_image_b).inputs.image, "person.png");
  assert.ok(patch.source_latent_b, "latent path kept for the crop (legacy) geometry");
  assert.equal(loadOf(nodesOf(prompt, "Krea2EditGroundedEncode")[0].inputs.image_b).inputs.image, "person.png");
  const single = buildWorkflow("krea2", "edit", sampleParams("edit"), ctx).prompt;
  assert.ok(!("source_image_b" in nodesOf(single, "Krea2EditModelPatch")[0].inputs));
});

test("face swap = ReActor, then a light face pass with the family's own model", () => {
  for (const f of ["sdxl", "zimage", "krea2"]) {
    const { prompt } = buildWorkflow(f, "faceswap", sampleParams("faceswap"), ctx);
    const swap = nodesOf(prompt, "ReActorFaceSwap")[0].inputs;
    assert.equal(swap.swap_model, "inswapper_128.onnx");
    assert.equal(swap.face_restore_model, "codeformer-v0.1.0.pth");
    const det = nodesOf(prompt, "FaceDetailer")[0].inputs;
    assert.equal(det.denoise, 0.25);
    assert.equal(prompt[det.image[0]].class_type, "ReActorFaceSwap");
  }
  const off = buildWorkflow("sdxl", "faceswap", { ...sampleParams("faceswap"), blend: false }, ctx).prompt;
  assert.ok(!types(off).includes("FaceDetailer") && !types(off).includes("CheckpointLoaderSimple"));
});

test("conform step fills declared defaults and drops inputs the node does not have", () => {
  const { prompt } = buildWorkflow("sdxl", "face", sampleParams("face"), ctx);
  const det = nodesOf(prompt, "FaceDetailer")[0].inputs;
  assert.equal(det.sam_detection_hint, "center-1");
  assert.equal(det.sam_mask_hint_use_negative, "False");
  const pre = buildWorkflow("sdxl", "pose", sampleParams("pose"), ctx).prompt;
  assert.ok(!("bogus" in nodesOf(pre, "DWPreprocessor")[0].inputs));
});

test("plain upscale loads no diffusion model", () => {
  for (const f of Object.keys(FAMILIES)) {
    const { prompt } = buildWorkflow(f, "upscale", { ...sampleParams("upscale"), refine: false }, ctx);
    assert.deepEqual(types(prompt).sort(), ["ImageScale", "ImageUpscaleWithModel", "LoadImage", "SaveImage", "UpscaleModelLoader"]);
  }
  const tiled = buildWorkflow("sdxl", "upscale", { ...sampleParams("upscale"), scale: 4 }, ctx).prompt;
  assert.ok(types(tiled).includes("UltimateSDUpscale"), "above 2304 px the refine is tiled");
});

test("mixing is refused: foreign LoRAs, models and unknown families", () => {
  assert.throws(() => buildWorkflow("anima", "generate", { ...sampleParams("generate"), loras: [{ name: "Illustrious/SDXL_AddMicroDetails_Illustrious_v6.safetensors" }] }, ctx), /not a Anima LoRA/);
  assert.throws(() => buildWorkflow("zimage", "generate", { ...sampleParams("generate"), model: "krea2_turbo_fp8_scaled.safetensors" }, ctx), /not installed for this family/);
  assert.throws(() => buildWorkflow("sdxl", "generate", { ...sampleParams("generate"), model: "sd15/dreamshaper_8.safetensors" }, ctx), /not installed for this family/);
  assert.throws(() => buildWorkflow("flux", "generate", {}, ctx), /Unknown model family/);
});

test("missing custom nodes are reported with the pack to install", () => {
  const lean = objectInfo(undefined, { without: CUSTOM_NODES });
  const leanCtx = { info: lean, inv: readInventory(lean) };
  assert.throws(() => buildWorkflow("sdxl", "face", sampleParams("face"), leanCtx), (e) => e.missing?.nodes?.[0]?.type === "FaceDetailer");
  assert.throws(() => buildWorkflow("zimage", "control", { ...sampleParams("control"), kind: "hed" }, leanCtx), /comfyui_controlnet_aux/);
  assert.ok(buildWorkflow("zimage", "control", sampleParams("control"), leanCtx).prompt, "depth maps work without the pack (native Depth Anything 3)");
  // An uploaded ready-made map needs no preprocessor.
  assert.ok(buildWorkflow("zimage", "control", { ...sampleParams("control"), isMap: true }, leanCtx).prompt);
  const r = readiness(leanCtx);
  assert.equal(r.sdxl.generate.state, "ready");
  assert.equal(r.sdxl.face.state, "missing");
  assert.equal(r.zimage.control.state, "limited", "control still runs with uploaded maps");
  assert.equal(r.krea2.control.state, "missing");
  assert.equal(r.anima.faceswap.state, "off");
});

test("readiness is green for a fully set up ComfyUI", () => {
  const r = readiness(ctx);
  for (const [f, tasks] of Object.entries(r)) for (const [t, v] of Object.entries(tasks)) if (v.state !== "off") assert.equal(v.state, "ready", `${f}/${t}: ${JSON.stringify(v.items.filter((i) => !i.ok))}`);
});

test("utilities and schema", () => {
  // Native BiRefNet (official template) when its model is installed, else ComfyUI-RMBG.
  const bg = buildUtility("remove-bg", { image: "example.png" }, ctx).prompt;
  assert.deepEqual(["LoadBackgroundRemovalModel", "RemoveBackground", "InvertMask", "JoinImageWithAlpha"].filter((t) => types(bg).includes(t)).length, 4);
  const noNative = objectInfo({ ...FILES, bgRemoval: [] });
  assert.ok(types(buildUtility("remove-bg", { image: "example.png" }, { info: noNative, inv: readInventory(noNative) }).prompt).includes("BiRefNetRMBG"));
  const map = buildUtility("map", { image: "example.png", kind: "pose", imageW: 800, imageH: 600 }, ctx).prompt;
  assert.ok(types(map).includes("DWPreprocessor"));
  const s = schema();
  assert.deepEqual(s.order, ["anima", "sdxl", "zimage", "krea2"]);
  assert.ok(s.families.anima.tasks.faceswap.unavailable);
  assert.ok(s.families.krea2.tasks.edit.fields.length);
  assert.ok(!s.families.sdxl.tasks.edit, "Smart Edit is Krea 2 only");
});

test("each workflow declares its requirements (derived from its own checks)", async () => {
  const { requirements } = await import("../engine/index.mjs");
  const r = requirements("krea2", "edit");
  assert.ok(r.nodes.some((n) => n.types.includes("Krea2EditModelPatch") && n.pack === "comfyui-krea2edit" && n.level === "required"));
  assert.ok(r.models.some((m) => m.file === "krea2_identity_edit_v1_2.safetensors" && m.folder === "loras/krea2/editor"));
  assert.ok(r.models.some((m) => m.file === "qwen3vl_4b_fp8_scaled.safetensors"), "the family's own text encoder");
  assert.deepEqual(requirements("anima", "faceswap"), { nodes: [], models: [] }, "not offered → nothing required");
  const s = schema();
  assert.deepEqual(s.families.krea2.tasks.edit.requires, r, "sent to the browser with the form schema");
  assert.equal(s.families.krea2.tasks.pose.badge, "Experimental");
});

test("an incomplete workflow is refused before it is built, naming exactly what is missing", () => {
  const lean = objectInfo({ ...FILES, loras: FILES.loras.filter((n) => !/identity_edit/.test(n)) }, { without: ["Krea2EditModelPatch", "Krea2EditGroundedEncode"] });
  const leanCtx = { info: lean, inv: readInventory(lean) };
  assert.throws(
    () => buildWorkflow("krea2", "edit", sampleParams("edit"), leanCtx),
    (e) => {
      assert.match(e.message, /^Krea 2 · Smart Edit cannot run yet\. Missing: /);
      assert.match(e.message, /comfyui-krea2edit \(Krea2EditModelPatch\)/);
      assert.match(e.message, /krea2_identity_edit_v1_2\.safetensors in models\/loras\/krea2\/editor\//);
      assert.deepEqual(e.missing.nodes.map((n) => n.type), ["Krea2EditModelPatch", "Krea2EditGroundedEncode"]);
      assert.equal(e.missing.models[0].file, "krea2_identity_edit_v1_2.safetensors");
      return true;
    },
  );
});

test("Anima control: Base v1.0 any-test-like v2 is preferred over legacy patches, whatever the file order", () => {
  const withPatches = (patches) => {
    const i = objectInfo({ ...FILES, patches });
    return { info: i, inv: readInventory(i) };
  };
  const patchOf = (prompt) => nodesOf(prompt, "ModelPatchLoader")[0].inputs.name;
  const both = withPatches(["anima-lllite-any-test-like-1-step2000.safetensors", "anima-lllite-any-test-like-v2.safetensors", "anima-lllite-lineart-1.safetensors", "anima-lllite-scribble-1.safetensors"]);
  for (const kind of ["lineart", "canny", "scribble", "gray"]) assert.equal(patchOf(buildWorkflow("anima", "control", { ...sampleParams("control"), kind }, both).prompt), "anima-lllite-any-test-like-v2.safetensors", kind);
  const legacy = withPatches(["anima-lllite-any-test-like-1-step2000.safetensors", "anima-lllite-lineart-1.safetensors", "anima-lllite-scribble-1.safetensors"]);
  assert.equal(patchOf(buildWorkflow("anima", "control", { ...sampleParams("control"), kind: "lineart" }, legacy).prompt), "anima-lllite-lineart-1.safetensors", "dedicated legacy line-art patch before legacy any-test");
  assert.equal(patchOf(buildWorkflow("anima", "control", { ...sampleParams("control"), kind: "scribble" }, legacy).prompt), "anima-lllite-scribble-1.safetensors");
  assert.throws(() => buildWorkflow("anima", "control", { ...sampleParams("control"), kind: "gray" }, legacy), /grayscale \(tones\) patch/, "grayscale is a mode of any-test-like v2 only");
});

test("Anima control: grayscale tone maps, patch override, and foreign patches refused", () => {
  const gray = buildWorkflow("anima", "control", { ...sampleParams("control"), kind: "gray" }, ctx).prompt;
  assert.ok(types(gray).includes("ImageLuminanceDetector"));
  assert.ok(!types(gray).includes("ImageInvert"), "tone maps are not inverted (only line maps are)");
  const any = buildWorkflow("anima", "control", { ...sampleParams("control"), kind: "any" }, ctx).prompt;
  assert.equal(nodesOf(any, "ModelPatchLoader")[0].inputs.name, "anima-lllite-any-test-like-v2.safetensors");
  assert.deepEqual(types(any).filter((t) => /Preprocessor|Detector|Canny|DA3/.test(t)), [], "Any: your own drawing is used as it is");
  assert.ok(!schema().families.anima.tasks["img2img-control"].fields.find((f) => f.key === "kind").choices.some((c) => c.value === "any"), "never offered on a source photo");
  const forced = buildWorkflow("anima", "control", { ...sampleParams("control"), kind: "lineart", patch: "anima-lllite-depth-1.safetensors" }, ctx).prompt;
  assert.equal(nodesOf(forced, "ModelPatchLoader")[0].inputs.name, "anima-lllite-depth-1.safetensors", "Advanced → Control patch is honoured");
  assert.throws(() => buildWorkflow("anima", "control", { ...sampleParams("control"), patch: "Z-Image-Turbo-Fun-Controlnet-Union.safetensors" }, ctx), /not installed for this family|control patch/);
  assert.throws(() => buildWorkflow("anima", "control", { ...sampleParams("control"), patch: "anima-lllite-inpainting-v2.safetensors" }, ctx), /control patch/, "inpaint patches are not control patches");
  assert.ok(!ctx.inv.families.anima.controlPatches.some((n) => /inpaint/.test(n)));
});

test("Anima Img2Img + Control: the source is encoded and also gives the map; a separate control image can replace it", () => {
  const { prompt } = buildWorkflow("anima", "img2img-control", { ...sampleParams("img2img-control"), kind: "depth" }, ctx);
  const ks = nodesOf(prompt, "KSampler")[0].inputs;
  assert.equal(ks.denoise, 0.6);
  const loads = nodesOf(prompt, "LoadImage");
  assert.equal(loads.length, 1, "one image: source and control");
  const lllite = nodesOf(prompt, "AnimaLLLiteApply")[0].inputs;
  assert.equal(lllite.strength, 0.8);
  assert.equal(nodesOf(prompt, "ModelPatchLoader")[0].inputs.name, "anima-lllite-depth-1.safetensors");
  assert.equal(prompt[ks.latent_image[0]].class_type, "VAEEncode", "img2img latent, not an empty canvas");
  assert.ok(types(prompt).includes("DA3Render"), "native depth map");
  const sep = buildWorkflow("anima", "img2img-control", { ...sampleParams("img2img-control"), kind: "lineart", control: "sketch.png", isMap: true }, ctx).prompt;
  const names = nodesOf(sep, "LoadImage").map((n) => n.inputs.image).sort();
  assert.deepEqual(names, ["example.png", "sketch.png"]);
  assert.ok(!types(sep).includes("LineArtPreprocessor"), "a ready-made map is used as is");
  const own = buildWorkflow("anima", "img2img-control", { ...sampleParams("img2img-control"), kind: "lineart", isMap: true }, ctx).prompt;
  assert.ok(types(own).includes("LineArtPreprocessor"), "the source photo itself is never treated as a map");
  const pose = schema().families.anima.tasks["img2img-control"].fields.find((f) => f.key === "kind").choices.find((c) => c.value === "pose");
  assert.equal(pose.status, "partial", "the legacy pose patch keeps its limitation");
});

test("dynamic-combo inputs of native nodes survive the conform step (Depth Anything 3)", () => {
  const { prompt } = buildWorkflow("anima", "control", { ...sampleParams("control"), kind: "depth" }, ctx);
  const render = nodesOf(prompt, "DA3Render")[0].inputs;
  assert.equal(render.output, "depth");
  assert.equal(render["output.normalization"], "v2_style", "the official template's Depth-Anything-V2-style normalisation");
  assert.equal(render["output.apply_sky_clip"], false);
  assert.equal(nodesOf(prompt, "DA3Inference")[0].inputs.mode, "mono");
  assert.equal(nodesOf(prompt, "LoadDA3Model")[0].inputs.model_name, "depth_anything_3_mono_large.safetensors");
});

test("Z-Image Union: each mode gets a patch that has it; lite on request; tile never used as Union", () => {
  const withPatches = (patches) => {
    const i = objectInfo({ ...FILES, patches });
    return { info: i, inv: readInventory(i) };
  };
  const patchOf = (prompt) => nodesOf(prompt, "ModelPatchLoader")[0].inputs.name;
  const run = (c2, kind, extra = {}) => patchOf(buildWorkflow("zimage", "control", { ...sampleParams("control"), kind, ...extra }, c2).prompt);
  assert.equal(run(ctx, "gray"), "Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors");
  assert.equal(run(ctx, "canny"), "Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors", "newest full patch by default");
  assert.equal(run(ctx, "canny", { patch: "Z-Image-Turbo-Fun-Controlnet-Union-2.1-lite-2602-8steps.safetensors" }), "Z-Image-Turbo-Fun-Controlnet-Union-2.1-lite-2602-8steps.safetensors", "Advanced → Control model (lite for low VRAM)");
  assert.ok(!ctx.inv.families.zimage.unionPatches.some((n) => /tile/i.test(n)), "tile models are not Union models");
  assert.throws(() => run(ctx, "canny", { patch: "Z-Image-Turbo-Fun-Controlnet-Tile-2.1-2601-8steps.safetensors" }), /is not an installed Z-Image Fun ControlNet Union model/);
  assert.throws(() => run(ctx, "canny", { patch: "anima-lllite-depth-1.safetensors" }), /is not an installed Z-Image Fun ControlNet Union model/, "another family's patch");
  const old = withPatches(["Z-Image-Turbo-Fun-Controlnet-Union.safetensors", "Z-Image-Turbo-Fun-Controlnet-Union-2.1-2601-8steps.safetensors"]);
  assert.equal(run(old, "scribble"), "Z-Image-Turbo-Fun-Controlnet-Union-2.1-2601-8steps.safetensors");
  assert.throws(() => run(old, "gray"), /gray mode needs Fun ControlNet Union 2\.1 \(2602\)/);
  assert.throws(() => run(old, "scribble", { patch: "Z-Image-Turbo-Fun-Controlnet-Union.safetensors" }), /has no scribble mode/);
  assert.deepEqual(old.inv.families.zimage.features, { scribble: true, gray: false, inpaint: true }, "the UI hides gray here");
  const v1 = withPatches(["Z-Image-Turbo-Fun-Controlnet-Union.safetensors"]);
  assert.deepEqual(v1.inv.families.zimage.features, { scribble: false, gray: false, inpaint: false });
  const kinds = schema().families.zimage.tasks.control.fields.find((f) => f.key === "kind").choices;
  assert.deepEqual(kinds.filter((k) => k.feature).map((k) => [k.value, k.feature]), [["scribble", "scribble"], ["gray", "gray"]]);
});

test("Z-Image Inpaint + structure guide: one Fun Union call with the map, the inpaint image and the mask", () => {
  const { prompt } = buildWorkflow("zimage", "inpaint", { ...sampleParams("inpaint"), guide: "depth" }, ctx);
  const fun = nodesOf(prompt, "ZImageFunControlnet");
  assert.equal(fun.length, 1, "a single combined call");
  const inputs = fun[0].inputs;
  assert.ok(inputs.image && inputs.inpaint_image && inputs.mask);
  const fit = prompt[inputs.image[0]];
  assert.deepEqual([fit.class_type, fit.inputs.width, fit.inputs.height], ["ImageScale", 832, 1216], "the map has the inpaint image's size");
  const none = buildWorkflow("zimage", "inpaint", sampleParams("inpaint"), ctx).prompt;
  assert.ok(!("image" in nodesOf(none, "ZImageFunControlnet")[0].inputs), "no guide → plain inpaint context");
  const v1 = objectInfo({ ...FILES, patches: ["Z-Image-Turbo-Fun-Controlnet-Union.safetensors"] });
  assert.throws(() => buildWorkflow("zimage", "inpaint", { ...sampleParams("inpaint"), guide: "depth" }, { info: v1, inv: readInventory(v1) }), /structure guide needs the inpaint mode of Fun ControlNet Union 2\.x/);
});

test("Z-Image Outpaint guide comes from a separate image of the whole canvas; Img2Img + Control encodes the source", () => {
  const noGuideImage = buildWorkflow("zimage", "outpaint", { ...sampleParams("outpaint"), guide: "canny" }, ctx);
  assert.ok(!("image" in nodesOf(noGuideImage.prompt, "ZImageFunControlnet")[0].inputs));
  assert.ok(noGuideImage.notes.some((n) => /guide image of the whole extended canvas/.test(n)));
  const guided = buildWorkflow("zimage", "outpaint", { ...sampleParams("outpaint"), guide: "canny", control: "layout.png" }, ctx).prompt;
  const fit = guided[nodesOf(guided, "ZImageFunControlnet")[0].inputs.image[0]].inputs;
  assert.deepEqual([fit.width, fit.height], [832 + 256, 1216], "the guide map covers the extended canvas");
  const i2i = buildWorkflow("zimage", "img2img-control", { ...sampleParams("img2img-control"), kind: "hed", denoise: 0.9 }, ctx).prompt;
  const ks = nodesOf(i2i, "KSampler")[0].inputs;
  assert.equal(ks.denoise, 0.9);
  assert.equal(i2i[ks.latent_image[0]].class_type, "VAEEncode");
  assert.ok(types(i2i).includes("HEDPreprocessor"));
  const shift = nodesOf(i2i, "ModelSamplingAuraFlow")[0];
  assert.equal(i2i[shift.inputs.model[0]].class_type, "ZImageFunControlnet", "control before the shift (template order)");
});

// ---- Krea 2 Identity Edit suite --------------------------------------------------------------
const k2 = (task, extra = {}) => {
  const def = FAMILIES.krea2.tasks[task];
  const mask = def.fields.some((f) => f.type === "mask" && !f.optional) ? { mask: "mask.png" } : {};
  return buildWorkflow("krea2", task, { ...sampleParams(task), ...mask, ...(def.example || {}), ...extra }, ctx);
};
const loadName = (prompt, link) => (link ? prompt[link[0]]?.inputs?.image : undefined);
function editParts(prompt) {
  const patch = nodesOf(prompt, "Krea2EditModelPatch")[0].inputs;
  const enc = nodesOf(prompt, "Krea2EditGroundedEncode");
  return { patch, a: loadName(prompt, patch.source_image), b: loadName(prompt, patch.source_image_b), instruction: enc[0].inputs.prompt, grounding: enc[0].inputs.grounding_px, ks: nodesOf(prompt, "KSampler")[0].inputs };
}

test("Krea 2 edit suite: every task is its own graph (references, defaults, instruction), not an alias", () => {
  const seen = new Map();
  for (const [task, def] of Object.entries(FAMILIES.krea2.tasks)) {
    if (!(task === "edit" || task.startsWith("k2-"))) continue;
    const { prompt } = k2(task);
    // Reframe reuses Identity Outpaint's graph by design; what it adds is the computed extension.
    const pad = nodesOf(prompt, "ImagePadForOutpaint")[0]?.inputs;
    const shape = JSON.stringify([...new Set(types(prompt))].sort()) + JSON.stringify(editParts(prompt).patch.ref_boost) + editParts(prompt).instruction + JSON.stringify(pad && [pad.left, pad.right, pad.top, pad.bottom]);
    assert.ok(!seen.has(shape), `${task} builds the same graph as ${seen.get(shape)}`);
    seen.set(shape, task);
    assert.ok(def.evidence && def.verified && def.fields.length, task);
  }
  assert.equal(seen.size, 19, "19 Identity Edit tasks");
});

test("Krea 2 edit suite: reference order follows training (image 1 = scene / edited image, image 2 = subject)", () => {
  const insert = editParts(k2("k2-insert", { person: "person.png" }).prompt);
  assert.deepEqual([insert.a, insert.b], ["example.png", "person.png"]);
  assert.match(insert.instruction, /^Place this person/);
  const face = editParts(k2("k2-face", { prompt: "" }).prompt);
  assert.deepEqual([face.a, face.b], ["example.png", "face.png"]);
  assert.equal(face.instruction, "A seamless face swap. Replace only the facial features of the subject in the input image with the identity from image_b.", "the documented sentence");
  const tryon = editParts(k2("k2-tryon").prompt);
  assert.deepEqual([tryon.a, tryon.b], ["example.png", "garment.png"]);
  const bg = editParts(k2("k2-background", { bg: "bg.png" }).prompt);
  assert.deepEqual([bg.a, bg.b], ["bg.png", "example.png"], "a background photo becomes the scene, the subject image 2");
  const bgText = editParts(k2("k2-background").prompt);
  assert.deepEqual([bgText.a, bgText.b], ["example.png", undefined]);
  const pose = editParts(k2("k2-pose").prompt);
  assert.deepEqual([pose.a, pose.b], ["pose.png", "example.png"], "the pose scene first, the character second");
  for (const t of ["k2-remove", "k2-outfit", "k2-scene", "k2-restage", "k2-sheet"]) assert.equal(editParts(k2(t).prompt).b, undefined, `${t} uses one reference`);
});

test("Krea 2 edit suite: per-task defaults from the author's guidance", () => {
  const boost = (t, x) => editParts(k2(t, x).prompt).patch.ref_boost;
  assert.equal(boost("edit"), 4, "4 = recommended likeness");
  assert.equal(boost("k2-remove"), 1, "removals fail with a strong reference");
  assert.equal(boost("k2-variation"), 0.7, "below 1 frees the result");
  assert.equal(editParts(k2("k2-scene").prompt).grounding, 512, "512 for stubborn scene changes");
  assert.equal(editParts(k2("k2-face").prompt).grounding, 1024, "1024 for people");
  assert.equal(editParts(k2("edit").prompt).ks.steps, 10, "Turbo 10 steps (author's workflow)");
  // Object Remove prefers a RAW model and the removal settings (CFG 3, ~20 steps) when none was chosen.
  const remove = k2("k2-remove", { model: "" }).prompt;
  assert.equal(nodesOf(remove, "UNETLoader")[0].inputs.unet_name, "krea2_raw_bf16.safetensors");
  const ks = editParts(remove).ks;
  assert.deepEqual([ks.steps, ks.cfg], [20, 3]);
  assert.equal(nodesOf(remove, "Krea2EditGroundedEncode").length, 2, "at CFG > 1 the negative is an empty grounded encode");
  assert.equal(nodesOf(remove, "Krea2EditGroundedEncode")[1].inputs.prompt, "");
  assert.equal(schema().families.krea2.tasks["k2-remove"].preferVariant, "regular");
  assert.equal(schema().families.krea2.tasks["k2-remove"].presets.regular.cfg, 3);
  assert.equal(nodesOf(k2("k2-remove", { model: "krea2_turbo_fp8_scaled.safetensors" }).prompt, "UNETLoader")[0].inputs.unet_name, "krea2_turbo_fp8_scaled.safetensors", "your choice wins");
});

test("Krea 2 edit suite: locality mask, face focus, masked latent and reframe geometry", () => {
  const plain = k2("k2-remove").prompt;
  assert.ok(!types(plain).includes("ImageCompositeMasked"), "no mask → the edit output as is");
  const local = k2("k2-remove", { mask: "mask.png" }).prompt;
  const paste = nodesOf(local, "ImageCompositeMasked")[0].inputs;
  assert.equal(local[paste.destination[0]].inputs.image, "example.png", "pasted back into the original");
  const back = local[paste.source[0]].inputs;
  assert.deepEqual([back.width, back.height], [832, 1216], "at the original size");
  const face = k2("k2-face").prompt;
  const focus = editParts(face).patch.ref_boost_mask;
  assert.equal(face[focus[0]].class_type, "SegsToCombinedMask", "ref_boost focused on the identity photo's face");
  const det = nodesOf(face, "BboxDetectorSEGS")[0].inputs;
  assert.equal(face[det.image[0]].inputs.image, "face.png");
  assert.equal(nodesOf(k2("k2-head").prompt, "BboxDetectorSEGS")[0].inputs.dilation, 64, "head: wider region (hair)");
  assert.ok(!("ref_boost_mask" in editParts(k2("k2-face", { focus: false }).prompt).patch));
  const lean = objectInfo(undefined, { without: ["BboxDetectorSEGS", "SegsToCombinedMask"] });
  const noImpact = buildWorkflow("krea2", "k2-face", { ...sampleParams("k2-face"), face: "face.png" }, { info: lean, inv: readInventory(lean) });
  assert.ok(noImpact.notes.some((n) => /Face focus skipped/.test(n)));
  const inpaint = k2("k2-inpaint", { mask: "mask.png" }).prompt;
  const ks = editParts(inpaint).ks;
  assert.equal(inpaint[ks.latent_image[0]].class_type, "SetLatentNoiseMask", "masked latent: unmasked pixels are kept");
  assert.ok(types(inpaint).includes("DifferentialDiffusion"));
  assert.deepEqual(editParts(inpaint).patch.target_latent, ks.latent_image, "target_latent = the sampler latent");
  const out = k2("k2-outpaint").prompt;
  assert.ok(types(out).includes("ImagePadForOutpaint") && out[editParts(out).ks.latent_image[0]].class_type === "SetLatentNoiseMask");
  const reframe = k2("k2-reframe", { imageW: 1024, imageH: 1024, aspect: "16:9", align: "center" }).prompt;
  const pad = nodesOf(reframe, "ImagePadForOutpaint")[0].inputs;
  assert.deepEqual([pad.left, pad.right, pad.top, pad.bottom], [400, 400, 0, 0], "1:1 → 16:9 centred");
  assert.throws(() => k2("k2-reframe", { imageW: 1920, imageH: 1080, aspect: "16:9" }), /already 16:9/);
  const variation = k2("k2-variation").prompt;
  assert.equal(nodesOf(variation, "EmptySD3LatentImage")[0].inputs.batch_size, 4);
  const sheet = nodesOf(k2("k2-sheet", { width: undefined, height: undefined }).prompt, "EmptySD3LatentImage")[0].inputs;
  assert.ok(sheet.width > sheet.height, "a sheet is wide");
  assert.throws(() => k2("k2-remove", { object: "" }), /Say what to remove/);
  assert.throws(() => k2("k2-insert", { person: null }), /Add the person to insert/);
});

test("reframe calculator: extends only, by alignment, in multiples of 8", async () => {
  const { reframeEdges } = await import("../engine/common.mjs");
  assert.deepEqual(reframeEdges(1024, 1024, 16 / 9, "left"), { left: 0, right: 800, top: 0, bottom: 0 }, "picture on the left grows to the right");
  assert.deepEqual(reframeEdges(1024, 1024, 16 / 9, "right"), { left: 800, right: 0, top: 0, bottom: 0 });
  assert.deepEqual(reframeEdges(1920, 1080, 9 / 16, "top"), { left: 0, right: 0, top: 0, bottom: 2336 }, "landscape → vertical");
  assert.deepEqual(reframeEdges(1000, 1000, 1, "center"), { left: 0, right: 0, top: 0, bottom: 0 });
  for (const v of Object.values(reframeEdges(833, 1217, 4 / 3, "center"))) assert.equal(v % 8, 0);
});
