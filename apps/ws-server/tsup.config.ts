import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  // @prisma/client ships a native query engine binary and generated code —
  // it must stay a real node_modules import, never bundled.
  external: ["@prisma/client"],
  // These are our own workspace packages. By default tsup treats anything
  // resolved via node_modules (which is how pnpm workspaces link them) as
  // external, but their compiled output still has bare relative imports
  // (e.g. "./constants") that Node's strict ESM loader can't resolve on its
  // own. Forcing them to be inlined here sidesteps that entirely.
  noExternal: ["@localfirst/shared", "@localfirst/db"],
});
