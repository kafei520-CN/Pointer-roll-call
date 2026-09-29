/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

// Tauri serves the built files from the app root. GitHub Pages project sites
// are served from /<repo>/, so only the Pages workflow sets VITE_BASE.
function siteBase(): string {
  if (process.env.TAURI_ENV_PLATFORM) {
    return "/";
  }
  const configured = process.env.VITE_BASE?.trim();
  if (!configured) {
    return "/";
  }
  const withLeading = configured.startsWith("/") ? configured : `/${configured}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

export default defineConfig(() => ({
  base: siteBase(),
  plugins: [react(), tailwindcss()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
