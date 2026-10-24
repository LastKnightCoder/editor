import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 45_000,
    hookTimeout: 45_000,
    poolOptions: { threads: { singleThread: true } },
  },
});
