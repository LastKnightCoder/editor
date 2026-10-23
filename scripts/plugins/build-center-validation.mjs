import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "packages/plugins/package.json"));
await require("esbuild").build({
  entryPoints: [path.join(root, "scripts/plugins/center-validation-server.ts")],
  outfile: path.join(root, "output/plugin-center-validation/server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: 'import { createRequire as createNodeRequire } from "node:module"; const require = createNodeRequire(import.meta.url);',
  },
});
