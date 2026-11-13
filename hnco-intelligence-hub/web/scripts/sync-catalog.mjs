// Copies ../shared/catalog.json (single source of truth, also read by the FastAPI backend)
// into the web app. Runs before `dev` and `build`; the committed copy is used when ../shared
// is not available (e.g. a Docker build whose context is only this folder).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "shared", "catalog.json");
const target = join(here, "..", "src", "data", "catalog.json");

if (!existsSync(source)) {
  console.log("[sync-catalog] ../shared/catalog.json not found; using the committed copy");
  process.exit(0);
}
const next = readFileSync(source, "utf8");
const current = existsSync(target) ? readFileSync(target, "utf8") : "";
if (next !== current) {
  writeFileSync(target, next);
  console.log("[sync-catalog] updated src/data/catalog.json");
}
