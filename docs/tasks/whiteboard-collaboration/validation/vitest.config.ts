import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, "../../../..");

export default defineConfig({
  root: directory,
  test: {
    environment: "node",
    include: ["*.test.ts"],
  },
  resolve: {
    alias: {
      yjs: path.join(repository, "packages/collaboration/node_modules/yjs"),
      slate: path.join(repository, "packages/editor-collab/node_modules/slate"),
      "@tau/collaboration": path.join(repository, "packages/collaboration/src/index.ts"),
      "@tau/db-schema": path.join(repository, "packages/db-schema"),
    },
  },
});
