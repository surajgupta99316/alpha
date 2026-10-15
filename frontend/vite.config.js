import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = Number(env.PORT) || 5000;

  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    plugins: [react()],
    server: {
      port: Number(env.CLIENT_PORT) || 5173,
      proxy: {
        "/api": `http://127.0.0.1:${apiPort}`,
      },
    },
  };
});
