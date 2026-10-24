import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@validation": path.resolve(import.meta.dirname, "validation"),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "scripts/**", "validation/storage/**"],
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
