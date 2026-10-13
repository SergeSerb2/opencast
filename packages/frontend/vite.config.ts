import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const pages = ["main", "ai-chat", "notes", "settings"] as const;

/**
 * In `vite dev`, inject `window.__OPENCAST__` when the dev script exports the
 * backend address (OPENCAST_BACKEND_URL / OPENCAST_TOKEN). Without them the
 * pages fall back to URL parameters or the in-browser mock backend.
 */
function devEnvironment(): Plugin {
  return {
    name: "opencast-dev-environment",
    apply: "serve",
    transformIndexHtml(html, ctx) {
      const backendUrl = (process.env.OPENCAST_BACKEND_URL ?? process.env.SURGECAST_BACKEND_URL);
      const token = (process.env.OPENCAST_TOKEN ?? process.env.SURGECAST_TOKEN);
      if (!backendUrl || !token) return html;
      const page = ctx.path.replace(/^\//, "").replace(/\.html$/, "") || "main";
      const env = { backendUrl, token, window: page, platform: "macos", macOSMajor: 26, appVersion: "dev", dev: true };
      return html.replace("<head>", `<head><script>window.__OPENCAST__=${JSON.stringify(env)};</script>`);
    },
  };
}

export default defineConfig(({ command }) => ({
  base: "./",
  plugins: [react(), devEnvironment()],
  server: { port: 5173, strictPort: false },
  build: {
    target: "safari18",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        [...pages, ...(command === "serve" ? (["gallery"] as const) : [])].map((page) => [page, fileURLToPath(new URL(`./${page}.html`, import.meta.url))]),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));
