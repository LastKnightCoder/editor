import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(path.join(root, "packages/plugins/package.json"));
const { build } = require("esbuild");
await build({
  absWorkingDir: root,
  entryPoints: ["apps/desktop/scripts/sync-storage/audit.ts"],
  outfile: "output/sync-storage-audit.mjs",
  platform: "node",
  format: "esm",
  bundle: true,
  banner: {
    js: 'import {createRequire as _require} from "node:module"; const require=_require(import.meta.url);',
  },
  plugins: [
    {
      name: "desktop-ipc-test-bridge",
      setup(build) {
        build.onResolve({ filter: /^@\/commands$/ }, () => ({
          path: "commands",
          namespace: "test-bridge",
        }));
        build.onLoad({ filter: /^commands$/, namespace: "test-bridge" }, () => ({
          resolveDir: root,
          contents:
            'import service from "./apps/desktop/src-electron/main/modules/s3.ts"; export const s3Upload = input => service.upload(input); export const s3ListObjects = input => service.listObjects(input);',
        }));
        build.onResolve({ filter: /^electron$/ }, () => ({
          path: "electron",
          namespace: "test-bridge",
        }));
        build.onLoad({ filter: /^electron$/, namespace: "test-bridge" }, () => ({
          contents: "export const ipcMain = {};",
        }));
      },
    },
  ],
});
