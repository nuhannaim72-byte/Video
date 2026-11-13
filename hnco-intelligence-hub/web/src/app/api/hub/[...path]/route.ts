import { connection, type NextRequest } from "next/server";

/**
 * Same-origin proxy to the HN.CO FastAPI backend. The browser only ever talks to /api/hub/*:
 * the backend URL stays server-side, and AI/storage keys live only in the backend.
 * The caller's Entra ID bearer token is forwarded as-is for the backend to validate.
 */
const API = process.env.HNCO_API_URL;

// Only these backend paths are reachable through the proxy.
const ALLOWED =
  /^(health|me|catalog|state|events|audit|tasks|tasks\/[\w-]+|tasks\/[\w-]+\/artifact|agents\/[\w-]+\/(chat|resolve)|approvals\/[\w-]+\/decision)$/;

async function proxy(req: NextRequest, ctx: RouteContext<"/api/hub/[...path]">) {
  await connection(); // always per-request, never prerendered
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!API) {
    return Response.json({ configured: false, error: "HNCO_API_URL is not set — running without a backend." }, { status: 503 });
  }
  if (!ALLOWED.test(joined)) return new Response("Not found", { status: 404 });

  const url = new URL(`/api/${joined}`, API);
  url.search = req.nextUrl.search;
  const headers = new Headers({ accept: req.headers.get("accept") ?? "*/*" });
  for (const h of ["authorization", "content-type"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === "GET" ? undefined : await req.text(),
      signal: req.signal,
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "HN.CO backend unreachable" }, { status: 502 });
  }
  const out = new Headers();
  for (const h of ["content-type", "cache-control", "www-authenticate"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (upstream.headers.get("content-type")?.startsWith("text/event-stream")) {
    out.set("cache-control", "no-cache, no-transform");
    out.set("x-accel-buffering", "no");
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST };
