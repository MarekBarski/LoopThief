import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "layout-save-endpoint",
      configureServer(server) {
        server.middlewares.use("/__layout/save", (req, res, next) => {
          if (req.method !== "POST") return next();

          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const targetPath = path.resolve(process.cwd(), "src/layout/layout.json");
              fs.writeFileSync(targetPath, body, "utf8");
              res.statusCode = 204;
              res.end();
            } catch {
              res.statusCode = 500;
              res.end();
            }
          });
        });
      },
    },
  ],
  clearScreen: false,
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
      ignored: ["**/src-tauri/**"],
    },
  },
});
