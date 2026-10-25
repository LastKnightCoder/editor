import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/testing/whiteboard-*.bench.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 900_000,
  },
});
