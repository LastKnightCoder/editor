import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export default defineConfig({
  root,
  resolve: {
    dedupe: ["react", "react-dom", "react-dnd", "react-dnd-html5-backend", "dnd-core", "yjs"],
    alias: {
      "@": resolve(root, "src"),
      "@tau/editor": resolve(root, "../../packages/editor"),
      "@tau/shared": resolve(root, "../../packages/shared"),
      "@tau/themes": resolve(root, "../../packages/themes"),
      "@tau/db-schema": resolve(root, "../../packages/db-schema"),
    },
  },
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ["e2e/collaboration/index.html"] },
  server: { host: "127.0.0.1", port: 5184, strictPort: false },
});
