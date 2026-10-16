import { buildPluginDistribution } from "../../packages/plugins/src/distribution.ts";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
await buildPluginDistribution(
  path.join(root, "plugins/distribution.json"),
  path.join(root, "apps/desktop/build/bundled-plugins")
);
