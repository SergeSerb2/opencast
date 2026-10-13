import { build } from "esbuild";
import { rmSync, mkdirSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: "linked",
  logLevel: "info",
  // node:sqlite and other builtins stay external automatically; keep JSON data inline.
  banner: {
    js: "import { createRequire as __scCreateRequire } from 'node:module'; const require = __scCreateRequire(import.meta.url);",
  },
};

await build({ ...common, entryPoints: { index: "src/main.ts" }, outdir: "dist", outExtension: { ".js": ".mjs" } });
