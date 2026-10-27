import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { nodeMiddleware } from "./server/handler.js";
import { shield } from "./server/firewall.js";

// Serves /api/chat during `npm run dev` / `npm run preview`, reading .env on the server side only.
function apiPlugin(mode) {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    name: "studytech-api",
    configureServer(s) { s.middlewares.use(shield); s.middlewares.use(nodeMiddleware); },
    configurePreviewServer(s) { s.middlewares.use(shield); s.middlewares.use(nodeMiddleware); },
  };
}

export default defineConfig(({ mode }) => ({ plugins: [react(), apiPlugin(mode)] }));
