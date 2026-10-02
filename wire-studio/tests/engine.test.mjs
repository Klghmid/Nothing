import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkflow, buildUtility, readiness, readInventory, suggestions, FAMILIES, schema } from "../engine/index.mjs";
import { classify, variantOf } from "../engine/inventory.mjs";
import { objectInfo, sampleParams, CUSTOM_NODES } from "./fixtures.mjs";

const info = objectInfo();
const ctx = { info, inv: readInventory(info) };
const types = (prompt) => Object.values(prompt).map((n) => n.class_type);
const nodesOf = (prompt, type) => Object.values(prompt).filter((n) => n.class_type === type);

// Follow a link back to the loader that produced it.
function origin(prompt, link, seen = new Set()) {
  const node = prompt[link[0]];
  if (!node || seen.has(link[0])) return [];
  seen.add(link[0]);
  if (/Loader|CheckpointLoaderSimple/.test(node.class_type) && !/LoraLoader|Krea2ControlLoRALoader/.test(node.class_type)) return [node];
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
  assert.deepEqual(union21.found, ["Z-Image-Turbo-Fun-Controlnet-Union-2.1-2601-8steps.safetensors"]);
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
  assert.deepEqual(f.krea2.controlLoras, ["krea2/krea2_depth_control_lora.safetensors"]);
  assert.equal(f.krea2.editLora, "krea2_identity_edit_v1_2.safetensors");
  assert.deepEqual(f.krea2.loras, ["krea2_darkbrush.safetensors"]);
  assert.deepEqual(ctx.inv.unsortedLoras, ["detail_slider.safetensors"]);
  assert.deepEqual(ctx.inv.otherLoras, ["FLUX/flux_realism_lora.safetensors", "Wan2.2/lightx2v_i2v_14B.safetensors"], "other families are listed apart, not as unsorted");
  assert.ok(ctx.inv.otherModels.includes("flux1-krea-dev.safetensors") && ctx.inv.otherModels.includes("sd15/dreamshaper_8.safetensors"));
  assert.deepEqual(f.sdxl.controlnets, ["SDXL/controlnet-union-sdxl-1.0-promax.safetensors", "sdxl/diffusers_xl_canny_full.safetensors"]);
  assert.equal(classify("animagine-xl-4.0.safetensors"), "sdxl", "Animagine is SDXL, not Anima");
  assert.equal(classify("detail_slider.safetensors", { "detail_slider.safetensors": "sdxl" }), "sdxl", "Library assignment wins");
});

for (const [familyId, fam] of Object.entries(FAMILIES)) {
  for (const [taskId, task] of Object.entries(fam.tasks)) {
    if (task.unavailable) {
      test(`${familyId}/${taskId} is refused with a reason`, () => assert.throws(() => buildWorkflow(familyId, taskId, sampleParams(taskId), ctx), /Not offered/));
      continue;
    }
    test(`${familyId}/${taskId} builds a valid, family-pure workflow`, () => {
      const { prompt } = buildWorkflow(familyId, taskId, sampleParams(taskId), ctx);
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
    });
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
  for (const t of ["Krea2ControlLoRALoader", "Krea2ControlImageEncode", "Krea2ControlApply", "DepthAnythingV2Preprocessor"]) assert.ok(types(control).includes(t), t);
  assert.equal(nodesOf(control, "Krea2ControlImageEncode")[0].inputs.channel_mode, "grayscale");
  const inpaint = buildWorkflow("krea2", "inpaint", sampleParams("inpaint"), ctx).prompt;
  assert.ok(types(inpaint).includes("DifferentialDiffusion"));
  const edit = buildWorkflow("krea2", "edit", sampleParams("edit"), ctx).prompt;
  assert.ok(types(edit).includes("Krea2EditModelPatch") && types(edit).includes("Krea2EditGroundedEncode"));
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
  assert.throws(() => buildWorkflow("zimage", "control", sampleParams("control"), leanCtx), /comfyui_controlnet_aux/);
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
  const bg = buildUtility("remove-bg", { image: "example.png" }, ctx).prompt;
  assert.ok(types(bg).includes("BiRefNetRMBG"));
  const map = buildUtility("map", { image: "example.png", kind: "pose", imageW: 800, imageH: 600 }, ctx).prompt;
  assert.ok(types(map).includes("DWPreprocessor"));
  const s = schema();
  assert.deepEqual(s.order, ["anima", "sdxl", "zimage", "krea2"]);
  assert.ok(s.families.anima.tasks.faceswap.unavailable);
  assert.ok(s.families.krea2.tasks.edit.fields.length);
  assert.ok(!s.families.sdxl.tasks.edit, "Smart Edit is Krea 2 only");
});
