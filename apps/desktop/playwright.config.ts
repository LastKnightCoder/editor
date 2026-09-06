import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  outputDir: "./output/playwright/test-results",
  reporter: "list",
});
