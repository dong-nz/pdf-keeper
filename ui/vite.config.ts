import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Fixed port (tauri.conf.json devUrl). TAURI_DEV_HOST is honored when Tauri
// starts the dev server on a device network (read through import.meta.env —
// no Node type package needed).
const host = import.meta.env?.TAURI_DEV_HOST as string | undefined;

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // Same mapping as tsconfig `paths` (DR-54: one canonical `$lib/…`
    // spelling for shared modules). Root-relative so no Node imports are
    // needed here and test runs resolve it too.
    alias: {
      $lib: "/src/lib",
    },
  },
  clearScreen: false,
  server: {
    host: host || "127.0.0.1",
    strictPort: true,
    port: 1420,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "chrome110",
    sourcemap: import.meta.env?.TAURI_ENV_DEBUG !== undefined,
  },
});
