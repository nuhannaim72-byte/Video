# Video

## HN.CO Intelligence Hub — Virtual Headquarters

[`hnco-intelligence-hub/`](hnco-intelligence-hub/README.md) is a 3D virtual corporate office for HN.CO:
twelve AI employees across twelve departments, a Managing Director's control centre, and a FastAPI
backend with a central AI orchestrator. Start there:

```bash
cd hnco-intelligence-hub/web && npm install && npm run dev    # http://localhost:3000
```

It was built with the 3D Web Pack agents and skills described below.

## 3D Web Pack

This repo includes the [3D Web Pack](https://github.com/skinnye/3d-web-pack) (MIT, © skinnye):
Claude Code agents and skills for building high-end 3D / WebGL websites with Three.js,
React Three Fiber, WebGPU, shaders, GSAP scroll motion and glTF asset pipelines.

| Path | What it is |
| :--- | :--- |
| `.claude/agents/` | The 6 agents, installed for this project. Claude Code picks them up automatically. |
| `.claude/skills/` | The 4 skills, installed for this project. Run them as `/skill-name`. |
| `3d-web-pack/` | An unmodified copy of the upstream repo (commit `cabd221`): docs, license, and the demo landing page. |

### Agents

| Agent | Use it for |
| :--- | :--- |
| `threejs-architect` | Planning: stack choice, scene graph, FPS and asset budgets |
| `r3f-engineer` | Building scenes in React Three Fiber / Three.js |
| `shader-artist` | GLSL and TSL (WebGPU) shaders and custom materials |
| `motion-choreographer` | Scroll storytelling, GSAP ScrollTrigger, Lenis, camera moves |
| `webgl-perf-auditor` | Frame drops, draw calls, memory, mobile performance |
| `asset-pipeline-engineer` | glTF/GLB compression (Draco, KTX2), gltfjsx, AI-generated models |

### Skills

| Skill | What it does |
| :--- | :--- |
| `/scaffold-3d-site` | Start a new Vite or Next.js + R3F project |
| `/optimize-3d-assets` | Compress models and textures for the web |
| `/add-postprocessing` | Add bloom, depth of field, grain and tone mapping |
| `/scroll-3d-scene` | Wire up scroll-driven 3D |

### Changes from upstream

The copies in `.claude/agents/` drop two assumptions about the pack's original author:
that the user writes in Russian and works on Windows. The agents now answer in whatever
language you write in. Everything else, including all of `3d-web-pack/`, matches upstream.

### Demo page

`3d-web-pack/index.html` is a static page (Three.js, custom shaders, GSAP) that loads its
libraries from jsDelivr. To view it locally:

```bash
cd 3d-web-pack && python3 -m http.server 8000
# open http://localhost:8000
```

### Updating

```bash
git clone --depth 1 https://github.com/skinnye/3d-web-pack.git /tmp/3d-web-pack
cp -r /tmp/3d-web-pack/agents/* .claude/agents/
cp -r /tmp/3d-web-pack/skills/* .claude/skills/
```

Copying over `.claude/agents/` brings back the upstream wording, so reapply the edits
described above afterwards.
