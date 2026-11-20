import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND_TARGET = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: BACKEND_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/forecast": { target: BACKEND_TARGET, changeOrigin: true },
      "/historical": { target: BACKEND_TARGET, changeOrigin: true },
      "/alerts": { target: BACKEND_TARGET, changeOrigin: true },
      "/models": { target: BACKEND_TARGET, changeOrigin: true },
      "/control": { target: BACKEND_TARGET, changeOrigin: true },
      "/engine": { target: BACKEND_TARGET, changeOrigin: true },
      "/simulate": { target: BACKEND_TARGET, changeOrigin: true },
      "/ingest": { target: BACKEND_TARGET, changeOrigin: true },
      "/auth": { target: BACKEND_TARGET, changeOrigin: true },
      "/district-dispatch": { target: BACKEND_TARGET, changeOrigin: true },
      "/health": { target: BACKEND_TARGET, changeOrigin: true },
    },
  },
});
