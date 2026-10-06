# Capability matrix

What each model family can do in Wire Studio today. The table is **generated from the engine**
(`engine/capabilities.mjs` reads the `status`, `evidence` and `verified` each task declares in
`engine/families/*.mjs`), so it always matches the code: run `npm run docs` after changing a
family, and `npm test` fails if this file is out of date.

**Status**

| Status | Meaning |
|---|---|
| READY | Offered. Follows an upstream-documented path; the graph is accepted by a live ComfyUI's validator and covered by tests. |
| PARTIAL | Offered, but limited (e.g. only one control type, or no dedicated model for the task). The note says what is missing. |
| EXPERIMENTAL | Offered with an *Experimental* badge: the method is plausible and validated as a graph, but results are not established. |
| RESEARCH_ONLY | Researched and documented, not offered (not verified enough). |
| MISSING | Not built yet (a model or method exists, or may exist). |
| UNSUPPORTED | Deliberately not offered: no model exists for this family, or the method does not work for it. |

**†** = the graph is validated against a live ComfyUI (node types, inputs, link types, value
ranges) but this exact workflow has **not yet been run on a GPU**. Cells without † were run on
real hardware in this form (Anima Studio's live tests). See
[WORKFLOW_IMPLEMENTATION_AUDIT.md](WORKFLOW_IMPLEMENTATION_AUDIT.md) for the list to verify.

<!-- generated:matrix -->
| Capability | Anima | SDXL | Z-Image | Krea 2 |
|---|---|---|---|---|
| Generate | READY | READY | READY | READY † |
| Img2Img | READY | READY | READY | READY † |
| Inpaint | READY | READY | READY † | PARTIAL † |
| Outpaint | READY | READY | READY † | PARTIAL † |
| Control | READY † | READY † | READY † | PARTIAL † |
| Controlled Img2Img | READY † | MISSING | READY † | EXPERIMENTAL † |
| Pose | PARTIAL † | READY † | READY † | EXPERIMENTAL † |
| Depth | READY † | READY † | READY † | READY † |
| Canny | READY † | READY † | READY † | MISSING |
| Lineart | READY † | READY † | UNSUPPORTED | MISSING |
| Scribble | READY † | READY † | READY † | MISSING |
| Gray / tone control | READY † | MISSING | READY † | MISSING |
| Face Fix | READY | READY | READY † | READY † |
| Hand Fix | READY | READY | READY † | READY † |
| Face Swap | UNSUPPORTED | READY † | READY † | READY † |
| Upscale | READY | READY | READY | READY † |
| Tile Restore | MISSING | MISSING | RESEARCH_ONLY | MISSING |
| Remove Background | READY † | READY † | READY † | READY † |
| Style Reference | UNSUPPORTED | MISSING | MISSING | READY † |
| Identity Editing | UNSUPPORTED | MISSING | MISSING | READY † |
| Object Remove | MISSING | MISSING | MISSING | READY † |
| Object Replace | MISSING | MISSING | MISSING | READY † |
| Background Replace | EXPERIMENTAL † | EXPERIMENTAL † | EXPERIMENTAL † | READY † |
| Face / Head Replace (identity) | MISSING | MISSING | MISSING | READY † |
| Virtual Try-On | MISSING | MISSING | MISSING | READY † |
| Character Restage / Sheet | MISSING | MISSING | MISSING | READY † |
| Reframe | READY † | READY † | READY † | PARTIAL † |

**Where each cell comes from**

- **Anima**
  - Generate: READY — task `generate`; official template / model author; run on a GPU
  - Img2Img: READY — task `img2img`; Wire Studio composition of documented nodes; run on a GPU
  - Inpaint: READY — task `inpaint`; official template / model author; run on a GPU
  - Outpaint: READY — task `outpaint`; Wire Studio composition of documented nodes; run on a GPU
  - Control: READY — task `control`; official template / model author; graph validated, not yet run on a GPU
  - Controlled Img2Img: READY — task `img2img-control`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
  - Pose: PARTIAL — task `pose`; community model or node pack; graph validated, not yet run on a GPU; Legacy pose patch; its own card says it guides placement loosely
  - Depth: READY — task `control` · type `depth`; official template / model author; graph validated, not yet run on a GPU
  - Canny: READY — task `control` · type `canny`; official template / model author; graph validated, not yet run on a GPU
  - Lineart: READY — task `control` · type `lineart`; official template / model author; graph validated, not yet run on a GPU
  - Scribble: READY — task `control` · type `scribble`; official template / model author; graph validated, not yet run on a GPU
  - Gray / tone control: READY — task `control` · type `gray`; official template / model author; graph validated, not yet run on a GPU
  - Face Fix: READY — task `face`; community model or node pack; run on a GPU
  - Hand Fix: READY — task `hands`; community model or node pack; run on a GPU
  - Face Swap: UNSUPPORTED — Not offered for Anima: face-swap models (InsightFace) are trained on photos and do not detect anime faces reliably. Use Face Fix with a character prompt or LoRA instead.
  - Upscale: READY — task `upscale`; Wire Studio composition of documented nodes; run on a GPU
  - Tile Restore: MISSING
  - Remove Background: READY — shared tool (no model family); official template / model author; graph validated, not yet run on a GPU; Native BiRefNet (official template) when its model is installed, else ComfyUI-RMBG; no model family involved
  - Style Reference: UNSUPPORTED — No IPAdapter or style-reference model exists for Anima, and Anima rejects area conditioning (Anima Studio live test).
  - Identity Editing: UNSUPPORTED — No identity-preserving edit or reference model exists for Anima.
  - Object Remove: MISSING
  - Object Replace: MISSING
  - Background Replace: EXPERIMENTAL — task `bg-replace`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU; Wire Studio's composition: a BiRefNet subject mask, then Anima's own inpaint; not yet run on a GPU
  - Face / Head Replace (identity): MISSING
  - Virtual Try-On: MISSING
  - Character Restage / Sheet: MISSING
  - Reframe: READY — task `reframe`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
- **SDXL**
  - Generate: READY — task `generate`; official template / model author; run on a GPU
  - Img2Img: READY — task `img2img`; Wire Studio composition of documented nodes; run on a GPU
  - Inpaint: READY — task `inpaint`; community model or node pack; run on a GPU
  - Outpaint: READY — task `outpaint`; Wire Studio composition of documented nodes; run on a GPU
  - Control: READY — task `control`; community model or node pack; graph validated, not yet run on a GPU
  - Controlled Img2Img: MISSING
  - Pose: READY — task `pose`; community model or node pack; graph validated, not yet run on a GPU
  - Depth: READY — task `control` · type `depth`; community model or node pack; graph validated, not yet run on a GPU
  - Canny: READY — task `control` · type `canny`; community model or node pack; graph validated, not yet run on a GPU
  - Lineart: READY — task `control` · type `lineart`; community model or node pack; graph validated, not yet run on a GPU
  - Scribble: READY — task `control` · type `scribble`; community model or node pack; graph validated, not yet run on a GPU
  - Gray / tone control: MISSING
  - Face Fix: READY — task `face`; community model or node pack; run on a GPU
  - Hand Fix: READY — task `hands`; community model or node pack; run on a GPU
  - Face Swap: READY — task `faceswap`; community model or node pack; graph validated, not yet run on a GPU
  - Upscale: READY — task `upscale`; Wire Studio composition of documented nodes; run on a GPU
  - Tile Restore: MISSING
  - Remove Background: READY — shared tool (no model family); official template / model author; graph validated, not yet run on a GPU; Native BiRefNet (official template) when its model is installed, else ComfyUI-RMBG; no model family involved
  - Style Reference: MISSING — IPAdapter style / composition reference (roadmap).
  - Identity Editing: MISSING — InstantID identity-preserving generation (roadmap).
  - Object Remove: MISSING
  - Object Replace: MISSING
  - Background Replace: EXPERIMENTAL — task `bg-replace`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU; Wire Studio's composition: a BiRefNet subject mask, then SDXL's own inpaint; not yet run on a GPU
  - Face / Head Replace (identity): MISSING
  - Virtual Try-On: MISSING
  - Character Restage / Sheet: MISSING
  - Reframe: READY — task `reframe`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
- **Z-Image**
  - Generate: READY — task `generate`; official template / model author; run on a GPU
  - Img2Img: READY — task `img2img`; Wire Studio composition of documented nodes; run on a GPU
  - Inpaint: READY — task `inpaint`; official template / model author; graph validated, not yet run on a GPU
  - Outpaint: READY — task `outpaint`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
  - Control: READY — task `control`; official template / model author; graph validated, not yet run on a GPU
  - Controlled Img2Img: READY — task `img2img-control`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
  - Pose: READY — task `pose`; official template / model author; graph validated, not yet run on a GPU
  - Depth: READY — task `control` · type `depth`; official template / model author; graph validated, not yet run on a GPU
  - Canny: READY — task `control` · type `canny`; official template / model author; graph validated, not yet run on a GPU
  - Lineart: UNSUPPORTED — Fun ControlNet Union has no line-art mode; use Soft edge (HED) or Scribble.
  - Scribble: READY — task `control` · type `scribble`; official template / model author; graph validated, not yet run on a GPU
  - Gray / tone control: READY — task `control` · type `gray`; official template / model author; graph validated, not yet run on a GPU
  - Face Fix: READY — task `face`; community model or node pack; graph validated, not yet run on a GPU
  - Hand Fix: READY — task `hands`; community model or node pack; graph validated, not yet run on a GPU
  - Face Swap: READY — task `faceswap`; community model or node pack; graph validated, not yet run on a GPU
  - Upscale: READY — task `upscale`; official template / model author; run on a GPU
  - Tile Restore: RESEARCH_ONLY — Z-Image-Turbo-Fun-Controlnet-Tile-2.1 exists, but no official ComfyUI template or documented input preparation could be verified (see WORKFLOW_RESEARCH.md, Phase 2).
  - Remove Background: READY — shared tool (no model family); official template / model author; graph validated, not yet run on a GPU; Native BiRefNet (official template) when its model is installed, else ComfyUI-RMBG; no model family involved
  - Style Reference: MISSING — No style-reference model for Z-Image was found.
  - Identity Editing: MISSING — Z-Image-Edit is announced but not released.
  - Object Remove: MISSING
  - Object Replace: MISSING
  - Background Replace: EXPERIMENTAL — task `bg-replace`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU; Wire Studio's composition: a BiRefNet subject mask, then Z-Image's own inpaint; not yet run on a GPU
  - Face / Head Replace (identity): MISSING
  - Virtual Try-On: MISSING
  - Character Restage / Sheet: MISSING
  - Reframe: READY — task `reframe`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
- **Krea 2**
  - Generate: READY — task `generate`; official template / model author; graph validated, not yet run on a GPU
  - Img2Img: READY — task `img2img`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
  - Inpaint: PARTIAL — task `inpaint`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU; No Krea 2 inpaint model; differential diffusion + masked sampling
  - Outpaint: PARTIAL — task `outpaint`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU; No Krea 2 inpaint model; differential diffusion + masked sampling
  - Control: PARTIAL — task `control`; community model or node pack; graph validated, not yet run on a GPU; Only depth control models are public
  - Controlled Img2Img: EXPERIMENTAL — task `img2img-control`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU; Wire Studio's combination of img2img and depth control; not yet run on a GPU
  - Pose: EXPERIMENTAL — task `pose`; community model or node pack; graph validated, not yet run on a GPU; Community OpenPose Control-LoRA, run as its author's workflow; not yet run on a GPU here
  - Depth: READY — task `control` · type `depth`; community model or node pack; graph validated, not yet run on a GPU
  - Canny: MISSING — No public Krea 2 canny Control-LoRA.
  - Lineart: MISSING — No public Krea 2 line-art Control-LoRA (one is announced by tori29umai).
  - Scribble: MISSING
  - Gray / tone control: MISSING
  - Face Fix: READY — task `face`; community model or node pack; graph validated, not yet run on a GPU
  - Hand Fix: READY — task `hands`; community model or node pack; graph validated, not yet run on a GPU
  - Face Swap: READY — task `faceswap`; community model or node pack; graph validated, not yet run on a GPU
  - Upscale: READY — task `upscale`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
  - Tile Restore: MISSING
  - Remove Background: READY — shared tool (no model family); official template / model author; graph validated, not yet run on a GPU; Native BiRefNet (official template) when its model is installed, else ComfyUI-RMBG; no model family involved
  - Style Reference: READY — task `style`; official template / model author; graph validated, not yet run on a GPU
  - Identity Editing: READY — task `edit`; community model or node pack; graph validated, not yet run on a GPU
  - Object Remove: READY — task `k2-remove`; community model or node pack; graph validated, not yet run on a GPU
  - Object Replace: READY — task `k2-replace`; community model or node pack; graph validated, not yet run on a GPU
  - Background Replace: READY — task `k2-background`; community model or node pack; graph validated, not yet run on a GPU
  - Face / Head Replace (identity): READY — task `k2-face`; community model or node pack; graph validated, not yet run on a GPU
  - Virtual Try-On: READY — task `k2-tryon`; community model or node pack; graph validated, not yet run on a GPU
  - Character Restage / Sheet: READY — task `k2-restage`; community model or node pack; graph validated, not yet run on a GPU
  - Reframe: PARTIAL — task `reframe`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU; No Krea 2 inpaint model; differential diffusion + masked sampling
<!-- /generated:matrix -->

## Workflow combinations

Combinations of reference, control and identity inputs that the expansion plan asked for,
per family. Offered ones take their status from the task or option that runs them; the others
say why they are not offered (evidence in [WORKFLOW_RESEARCH.md](WORKFLOW_RESEARCH.md)).

<!-- generated:combos -->
**Krea 2**

| Combination | Status | How | Notes |
|---|---|---|---|
| Style + Prompt | READY | task `style`; official template / model author; graph validated, not yet run on a GPU |  |
| Style + Img2Img | EXPERIMENTAL | task `style`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU |  |
| Style + Identity | UNSUPPORTED | — | The Identity Edit patch (comfyui-krea2edit) replaces the model forward and ignores Krea 2's native reference latents, so the style references would be silently dropped. |
| Style + Depth | RESEARCH_ONLY | — | With the depth Control-LoRA the style reference tokens break its control-token count ("Krea2 control token count mismatch"); UniDepth overwrites the style reference latents. No tested combination exists. |
| Style + Pose | RESEARCH_ONLY | — | The style LoRA and the pose LoRA each expect their own image as reference 1; no tested combination exists. |
| Depth + Prompt | READY | task `control`; community model or node pack; graph validated, not yet run on a GPU |  |
| Depth + Source image (img2img) | EXPERIMENTAL | task `img2img-control`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU |  |
| Depth + Reference images | EXPERIMENTAL | task `control`; community model or node pack; graph validated, not yet run on a GPU | UniDepth: one reference image plus a second stacked one |
| Depth conditioning range | EXPERIMENTAL | task `control`; community model or node pack; graph validated, not yet run on a GPU | UniDepth only, one start/end window for the depth map and its references together; the Control-LoRA nodes have no range |
| Depth + Identity | UNSUPPORTED | — | The Identity Edit patch ignores reference latents (so UniDepth's depth map is dropped) and runs the input projection once per source image, so the depth Control-LoRA would add the depth map to the source images too, or stop with a token-count mismatch when their sizes differ. |
| Depth-guided outpaint | EXPERIMENTAL | task `outpaint`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU |  |
| Depth-guided reframe | EXPERIMENTAL | task `reframe`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU |  |
| Pose → Image | EXPERIMENTAL | task `pose`; community model or node pack; graph validated, not yet run on a GPU |  |
| Pose + Source image | EXPERIMENTAL | task `pose`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU | Img2img start latent with the pose LoRA (Wire Studio composition) |
| Pose + Identity | EXPERIMENTAL | task `k2-pose`; community model or node pack; graph validated, not yet run on a GPU | Pose Restage in the Identity Edit suite |
| Pose + Style | RESEARCH_ONLY | — | The OpenPose LoRA's author describes it as "not a reference + pose fusion model"; no tested combination with the style LoRA exists. |
| Pose + Identity + Style | RESEARCH_ONLY | — | Needs Pose + Style first (see above); the Identity Edit patch also ignores the other references. |
<!-- /generated:combos -->

Research and sources for every workflow: [WORKFLOW_RESEARCH.md](WORKFLOW_RESEARCH.md).
