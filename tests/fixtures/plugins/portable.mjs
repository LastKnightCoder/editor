import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const esbuild = createRequire(path.join(root, "apps/mobile/package.json")).resolve("esbuild");
export async function portableFixtures() {
  if (process.env.TAU_PORTABLE_VALIDATION_ARTIFACTS)
    return JSON.parse(await readFile(process.env.TAU_PORTABLE_VALIDATION_ARTIFACTS, "utf8"));
  const manifest = JSON.parse(
    await readFile(path.join(root, "scripts/plugins/template/manifest.json"), "utf8")
  );
  const options = {
    entryPoints: [path.join(root, "scripts/plugins/template/src/index.tsx")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    loader: { ".css": "empty" },
    nodePaths: [path.join(root, "apps/desktop/node_modules")],
    external: ["@tau/plugins", "@tau/ui", "react", "react-dom", "react/jsx-runtime"],
    define: {
      __PLUGIN_PORTABLE__: "true",
      __PLUGIN_META__: JSON.stringify({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
      }),
    },
  };
  const code = execFileSync(
    process.execPath,
    [
      "-e",
      `process.stdout.write(require(${JSON.stringify(esbuild)}).buildSync(${JSON.stringify(options)}).outputFiles[0].text)`,
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
  );
  manifest.integrity = { "main.js": createHash("sha256").update(code).digest("hex") };
  const directory = path.join(root, "tests/fixtures/plugins/releases/tau.abc/0.1.0");
  const abc = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  delete abc.minAppVersion;
  Object.assign(abc, {
    formatVersion: 3,
    platform: "portable",
    profile: "web-v1",
    targets: Object.fromEntries(
      ["desktop", "android", "ios"].map(platform => [
        platform,
        {
          minAppVersion: platform === "desktop" ? "0.59.0" : "0.2.0",
          required: ["editor.elements.v1", "editor.codecs.v1", "editor.source.v1"],
          optional: [],
          elements: { abc: "edit" },
        },
      ])
    ),
  });
  return [
    { manifest, code },
    {
      manifest: abc,
      code: await readFile(path.join(directory, abc.main), "utf8"),
      css: await readFile(path.join(directory, abc.styles), "utf8"),
    },
  ];
}
