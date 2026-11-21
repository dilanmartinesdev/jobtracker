import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    // Never inline files as data: URIs. The Content-Security-Policy in nginx allows fonts and
    // images only from our own origin, so inlined ones would be blocked.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    // In development the API runs on :8000; proxying keeps the browser on a single origin.
    proxy: { "/api": "http://localhost:8000" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
