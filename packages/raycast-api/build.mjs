import { build } from "esbuild";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/node_modules", { recursive: true });
const require = createRequire(import.meta.url);
for (const name of ["react", "react-reconciler", "scheduler"]) {
  const resolver = name === "scheduler" ? createRequire(require.resolve("react-reconciler")) : require;
  cpSync(dirname(resolver.resolve(`${name}/package.json`)), `dist/node_modules/${name}`, { recursive: true });
}
const common = { bundle: true, platform: "node", format: "cjs", target: "node22", sourcemap: true, external: ["react", "react/*", "react-reconciler", "react-reconciler/*", "./runtime.cjs"], logLevel: "info" };
await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/runtime.cjs" });
// Worker shares bridge/reconciler state with runtime.cjs rather than bundling a
// second runtime. Re-export the private host entry points from a separate module.
await build({ ...common, entryPoints: ["src/worker.ts"], outfile: "dist/worker.cjs", plugins: [{ name: "shared-runtime", setup(build) {
  build.onResolve({ filter: /^\.\/(bridge|renderer)$/ }, (args) => args.importer.endsWith("/worker.ts") ? { path: args.path.slice(2), namespace: "shared-runtime" } : undefined);
  build.onLoad({ filter: /.*/, namespace: "shared-runtime" }, (args) => ({ contents: `module.exports = require('./runtime.cjs').__host.${args.path};`, loader: "js" }));
} }] });
cpSync("public-api.d.ts", "dist/index.d.ts");
cpSync("THIRD-PARTY-NOTICES.md", "dist/THIRD-PARTY-NOTICES.md");
mkdirSync("dist/node_modules/@raycast/api", { recursive: true });
writeFileSync("dist/node_modules/@raycast/api/package.json", JSON.stringify({ name: "@raycast/api", main: "index.cjs" }));
writeFileSync("dist/node_modules/@raycast/api/index.cjs", "module.exports = require('../../../runtime.cjs');\n");
