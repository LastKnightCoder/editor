import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const require = createRequire(path.join(root, "packages/whiteboard/package.json"));
export default defineConfig({
  root: directory,
  esbuild: { jsx: "automatic" },
  resolve: {
    dedupe: ["react", "react-dom", "slate", "slate-react"],
    alias: {
      react: path.dirname(require.resolve("react/package.json")),
      "react-dom": path.dirname(require.resolve("react-dom/package.json")),
      "lucide-react": path.dirname(require.resolve("lucide-react/package.json")),
      slate: path.dirname(require.resolve("slate/package.json")),
      "slate-react": path.dirname(require.resolve("slate-react/package.json")),
      yjs: path.join(root, "packages/collaboration/node_modules/yjs"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["*.test.ts"],
    setupFiles: [path.join(root, "packages/whiteboard/src/test-setup.ts")],
    globalSetup: [path.join(root, "scripts/ensure-node-sqlite.mjs")],
    testTimeout: 20000,
    hookTimeout: 30000,
    reporters: ["default", "json"],
    outputFile: process.env.TAU_STICKMAN_RESULT,
  },
});
