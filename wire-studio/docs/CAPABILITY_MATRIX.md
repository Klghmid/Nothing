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
| Controlled Img2Img | READY † | MISSING | MISSING | MISSING |
| Pose | PARTIAL † | READY † | READY † | EXPERIMENTAL † |
| Depth | READY † | READY † | READY † | READY † |
| Canny | READY † | READY † | READY † | MISSING |
| Lineart | READY † | READY † | UNSUPPORTED | MISSING |
| Face Fix | READY | READY | READY † | READY † |
| Hand Fix | READY | READY | READY † | READY † |
| Face Swap | UNSUPPORTED | READY † | READY † | READY † |
| Upscale | READY | READY | READY | READY † |
| Remove Background | READY † | READY † | READY † | READY † |
| Style Reference | UNSUPPORTED | MISSING | MISSING | READY † |
| Identity Editing | UNSUPPORTED | MISSING | MISSING | READY † |

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
  - Face Fix: READY — task `face`; community model or node pack; run on a GPU
  - Hand Fix: READY — task `hands`; community model or node pack; run on a GPU
  - Face Swap: UNSUPPORTED — Not offered for Anima: face-swap models (InsightFace) are trained on photos and do not detect anime faces reliably. Use Face Fix with a character prompt or LoRA instead.
  - Upscale: READY — task `upscale`; Wire Studio composition of documented nodes; run on a GPU
  - Remove Background: READY — shared tool (no model family); community model or node pack; graph validated, not yet run on a GPU; ComfyUI-RMBG BiRefNet / RMBG; no model family involved
  - Style Reference: UNSUPPORTED — No IPAdapter or style-reference model exists for Anima, and Anima rejects area conditioning (Anima Studio live test).
  - Identity Editing: UNSUPPORTED — No identity-preserving edit or reference model exists for Anima.
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
  - Face Fix: READY — task `face`; community model or node pack; run on a GPU
  - Hand Fix: READY — task `hands`; community model or node pack; run on a GPU
  - Face Swap: READY — task `faceswap`; community model or node pack; graph validated, not yet run on a GPU
  - Upscale: READY — task `upscale`; Wire Studio composition of documented nodes; run on a GPU
  - Remove Background: READY — shared tool (no model family); community model or node pack; graph validated, not yet run on a GPU; ComfyUI-RMBG BiRefNet / RMBG; no model family involved
  - Style Reference: MISSING — IPAdapter style / composition reference (roadmap).
  - Identity Editing: MISSING — InstantID identity-preserving generation (roadmap).
- **Z-Image**
  - Generate: READY — task `generate`; official template / model author; run on a GPU
  - Img2Img: READY — task `img2img`; Wire Studio composition of documented nodes; run on a GPU
  - Inpaint: READY — task `inpaint`; official template / model author; graph validated, not yet run on a GPU
  - Outpaint: READY — task `outpaint`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
  - Control: READY — task `control`; official template / model author; graph validated, not yet run on a GPU
  - Controlled Img2Img: MISSING
  - Pose: READY — task `pose`; official template / model author; graph validated, not yet run on a GPU
  - Depth: READY — task `control` · type `depth`; official template / model author; graph validated, not yet run on a GPU
  - Canny: READY — task `control` · type `canny`; official template / model author; graph validated, not yet run on a GPU
  - Lineart: UNSUPPORTED — Fun ControlNet Union has no line-art mode; use Soft edge (HED) or Scribble.
  - Face Fix: READY — task `face`; community model or node pack; graph validated, not yet run on a GPU
  - Hand Fix: READY — task `hands`; community model or node pack; graph validated, not yet run on a GPU
  - Face Swap: READY — task `faceswap`; community model or node pack; graph validated, not yet run on a GPU
  - Upscale: READY — task `upscale`; official template / model author; run on a GPU
  - Remove Background: READY — shared tool (no model family); community model or node pack; graph validated, not yet run on a GPU; ComfyUI-RMBG BiRefNet / RMBG; no model family involved
  - Style Reference: MISSING — No style-reference model for Z-Image was found.
  - Identity Editing: MISSING — Z-Image-Edit is announced but not released.
- **Krea 2**
  - Generate: READY — task `generate`; official template / model author; graph validated, not yet run on a GPU
  - Img2Img: READY — task `img2img`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
  - Inpaint: PARTIAL — task `inpaint`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU; No Krea 2 inpaint model; differential diffusion + masked sampling
  - Outpaint: PARTIAL — task `outpaint`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU; No Krea 2 inpaint model; differential diffusion + masked sampling
  - Control: PARTIAL — task `control`; community model or node pack; graph validated, not yet run on a GPU; Only a depth Control-LoRA is public
  - Controlled Img2Img: MISSING
  - Pose: EXPERIMENTAL — task `pose`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU; Pose carried through a depth map (no pose model was used)
  - Depth: READY — task `control` · type `depth`; community model or node pack; graph validated, not yet run on a GPU
  - Canny: MISSING — No public Krea 2 canny Control-LoRA.
  - Lineart: MISSING — No public Krea 2 line-art Control-LoRA (one is announced by tori29umai).
  - Face Fix: READY — task `face`; community model or node pack; graph validated, not yet run on a GPU
  - Hand Fix: READY — task `hands`; community model or node pack; graph validated, not yet run on a GPU
  - Face Swap: READY — task `faceswap`; community model or node pack; graph validated, not yet run on a GPU
  - Upscale: READY — task `upscale`; Wire Studio composition of documented nodes; graph validated, not yet run on a GPU
  - Remove Background: READY — shared tool (no model family); community model or node pack; graph validated, not yet run on a GPU; ComfyUI-RMBG BiRefNet / RMBG; no model family involved
  - Style Reference: READY — task `generate`; official template / model author; graph validated, not yet run on a GPU
  - Identity Editing: READY — task `edit`; community model or node pack; graph validated, not yet run on a GPU
<!-- /generated:matrix -->

Research and sources for every workflow: [WORKFLOW_RESEARCH.md](WORKFLOW_RESEARCH.md).
