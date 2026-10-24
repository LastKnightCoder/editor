import { configDefaults, defineConfig } from "vitest/config";
import base from "../../vitest.config";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["validation/storage/hosts.test.tsx"],
    exclude: configDefaults.exclude,
  },
});
