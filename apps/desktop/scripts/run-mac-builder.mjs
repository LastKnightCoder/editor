import { createRequire } from "node:module";
import path from "node:path";
import { createPlatformPackagerFactory } from "./parallel-mac-packager.mjs";

const require = createRequire(import.meta.url);
const { build, createYargs, configureBuildCommand } = require("electron-builder/out/builder");
const builderRequire = createRequire(require.resolve("electron-builder"));
const builder = builderRequire("app-builder-lib");
const appBuilderRequire = createRequire(builderRequire.resolve("app-builder-lib"));
const { notarize } = appBuilderRequire("@electron/notarize");
const { computeArchToTargetNamesMap } = builderRequire("app-builder-lib/out/targets/targetFactory");
const { loadEnv } = builderRequire("app-builder-lib/out/util/config/load");

try {
  await createYargs()
    .command(["build", "*"], "Build", configureBuildCommand, async args => {
      await loadEnv(path.join(process.cwd(), "electron-builder.env"));
      await build({
        ...args,
        platformPackagerFactory: createPlatformPackagerFactory(
          builder,
          computeArchToTargetNamesMap,
          notarize
        ),
      });
    })
    .help()
    .strict()
    .recommendCommands()
    .parseAsync(process.argv.slice(2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
