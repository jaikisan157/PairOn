import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import type { Plugin } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// Plugin to enable cross-origin isolation (required by WebContainers for SharedArrayBuffer)
function crossOriginIsolation(): Plugin {
  return {
    name: 'cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        next();
      });
    },
    transformIndexHtml(html) {
      // Add crossorigin="anonymous" to external link/script tags so they work under require-corp
      return html
        .replace(/<link([^>]+)href="https?:\/\//g, '<link crossorigin="anonymous"$1href="https://')
        .replace(/<script([^>]+)src="https?:\/\//g, '<script crossorigin="anonymous"$1src="https://');
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react(), crossOriginIsolation()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
