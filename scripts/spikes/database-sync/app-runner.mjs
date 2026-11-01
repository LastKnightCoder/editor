import { createRequire } from "node:module";
import { realpathSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../../..");
const require = createRequire(
  realpathSync(join(root, "apps/collaboration-server/node_modules/tsx/package.json"))
);
const { build } = require("esbuild");
const stress = process.argv.includes("--stress");
const multi = process.argv.includes("--multi");
const output = join(
  root,
  `apps/desktop/node_modules/.cache/device-sync/${stress ? "resilience-verify" : multi ? "multi-verify" : "app-verify"}.cjs`
);
mkdirSync(join(root, "apps/desktop/node_modules/.cache/device-sync"), { recursive: true });
const dependencies = Object.keys(
  JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8")).dependencies
);
await build({
  entryPoints: [
    join(
      import.meta.dirname,
      stress
        ? "verify-resilience.ts"
        : multi
          ? "verify-multi-device.ts"
          : "verify-app-integration.ts"
    ),
  ],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  alias: {
    "@": join(root, "apps/desktop/src"),
    yjs: join(root, "packages/collaboration/node_modules/yjs/dist/yjs.mjs"),
    "@tauri-apps/api/core": join(import.meta.dirname, "verify-native-bridge.ts"),
    "@tauri-apps/api/event": join(import.meta.dirname, "verify-native-bridge.ts"),
  },
  external: ["electron", ...dependencies],
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "raw-sql",
      setup(builder) {
        builder.onResolve({ filter: /\?raw$/ }, args => ({ path: args.path, namespace: "raw" }));
        builder.onLoad({ filter: /.*/, namespace: "raw" }, args => {
          const path = require.resolve(args.path.replace(/\?raw$/, ""), {
            paths: [join(root, "apps/desktop")],
          });
          return {
            contents: `export default ${JSON.stringify(readFileSync(path, "utf8"))};`,
            loader: "js",
          };
        });
      },
    },
  ],
});
const electron = createRequire(join(root, "apps/desktop/package.json"))("electron");
const result = spawnSync(electron, [output], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_PATH: join(root, "apps/desktop/node_modules"),
  },
});
process.exitCode = result.status ?? 1;
