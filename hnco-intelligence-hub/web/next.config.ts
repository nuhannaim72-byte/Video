import path from "node:path";
import type { NextConfig } from "next";

// The project root is the parent folder so the app can import ../shared/catalog.json,
// the single source of truth for agents and departments (also read by the FastAPI backend).
const projectRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
