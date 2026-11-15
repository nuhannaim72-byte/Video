# HN.CO Intelligence Hub — web

Next.js app: the corporate landing page (`/`), the 3D headquarters (`/hq`) and the same-origin
proxy to the backend (`/api/hub/*`). See the [project README](../README.md).

```bash
npm install
npm run dev         # http://localhost:3000
npm run build       # production build (.next/standalone)
npm run typecheck && npm run lint && npm run test:sim
```

`shared/catalog.json` is the source of truth for employees and departments; `npm run dev` and
`npm run build` copy it into `src/data/catalog.json`.
