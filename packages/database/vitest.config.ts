import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { dedupe: ["react", "react-dom", "react-dnd"] },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"], restoreMocks: true },
});
