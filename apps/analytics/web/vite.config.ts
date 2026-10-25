import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"] },
  server: {
    port: 5181,
    strictPort: true,
    proxy: { "/v1": "http://localhost:8787", "/health": "http://localhost:8787" },
  },
  build: {
    target: ["chrome107", "edge107", "firefox104", "safari16"],
    outDir: "dist",
    emptyOutDir: true,
  },
});
