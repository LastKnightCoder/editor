import { mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(base, {
  test: {
    include: ["bench/plugin-task-domain.stress.ts", "bench/plugin-directory.stress.ts"],
    environment: "node",
    testTimeout: 120000,
  },
});
