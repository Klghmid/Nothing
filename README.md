# Wire Studio

A clean local front-end for **ComfyUI** with independent, tested workflows for Anima, SDXL
(Illustrious / NoobAI / Pony), Z-Image and Krea 2.

Everything lives in [`wire-studio/`](wire-studio/):

- [README](wire-studio/README.md): start it, connect it to ComfyUI, use it
- [ComfyUI folder guide](wire-studio/docs/MODEL-FOLDERS.md): where every model file goes
- [Workflows](wire-studio/docs/WORKFLOWS.md): what each family runs for each task, and why
- [Plan](wire-studio/docs/PLAN.md): architecture and roadmap

```bash
cd wire-studio
COMFY_URL=http://127.0.0.1:8188 ./start.sh     # Windows: start.bat
```

Requires Node.js 20+; no other installation.
