import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = process.env["API_URL"] ?? "http://localhost:3001";

export default defineConfig({
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [react(), tailwindcss()],
  server: {
    // The client talks to its own origin and the dev server proxies. That keeps
    // dev and production identical — in production one Bun process serves both
    // — so there is no CORS configuration that exists only in one of them, and
    // the page works unchanged from a phone on the same network.
    proxy: {
      // The OAuth endpoints one by one, never `/oauth` as a prefix: the
      // consent and manual pages under `/oauth/` are the client's routes.
      "/.well-known": { changeOrigin: true, target: API_TARGET },
      "/api": { changeOrigin: true, target: API_TARGET },
      "/froggy-cli.js": { changeOrigin: true, target: API_TARGET },
      "/health": { changeOrigin: true, target: API_TARGET },
      "/mcp": { changeOrigin: true, target: API_TARGET },
      "/oauth/register": { changeOrigin: true, target: API_TARGET },
      "/oauth/revoke": { changeOrigin: true, target: API_TARGET },
      "/oauth/token": { changeOrigin: true, target: API_TARGET },
      "/oracle": { changeOrigin: true, target: API_TARGET },
      "/ws": { target: API_TARGET, ws: true },
    },
    strictPort: true,
  },
});
