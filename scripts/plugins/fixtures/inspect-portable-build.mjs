import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import AdmZip from "adm-zip";
import { validatePluginManifest } from "@tau/plugins/package";
import {
  validatePortablePluginManifest,
  readPortablePluginManifest,
  validatePortableDistributionManifest,
  assertPortablePluginCompatibility,
} from "@tau/plugins/portable";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const archive = await readFile(`dist/${manifest.id}-${manifest.version}.zip`);
const zip = new AdmZip(archive);
const packaged = JSON.parse(zip.readAsText(`${manifest.id}/manifest.json`));
const parsed = validatePortablePluginManifest(packaged);
assert.deepEqual(validatePortableDistributionManifest(packaged), parsed);
assert.throws(() => validatePluginManifest(packaged));
const allowed = new Set([
  "manifest.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  ...Object.keys(parsed.integrity),
]);
for (const entry of zip.getEntries()) {
  if (entry.isDirectory) continue;
  assert(entry.entryName.startsWith(`${parsed.id}/`));
  assert(allowed.has(entry.entryName.slice(parsed.id.length + 1)));
}
for (const [file, hash] of Object.entries(parsed.integrity))
  assert.equal(
    createHash("sha256")
      .update(zip.readFile(`${parsed.id}/${file}`))
      .digest("hex"),
    hash
  );
const targets = [];
for (const platform of ["desktop", "android", "ios"]) {
  const target = parsed.targets[platform];
  const environment = {
    platform,
    input: { coarsePointer: platform !== "desktop", finePointer: platform === "desktop" },
  };
  const host = {
    environment,

    appVersion: target.minAppVersion,
    profiles: ["web-v1"],
  };
  assertPortablePluginCompatibility(parsed, host);
  assert.throws(() => assertPortablePluginCompatibility(parsed, { ...host, profiles: [] }));
  assert.throws(() => assertPortablePluginCompatibility(parsed, { ...host, appVersion: "0.0.0" }));
  targets.push(platform);
}
const project = await realpath(process.cwd());
const installed = {};
for (const name of ["@tau/plugins", "@tau/ui", "react", "react-dom", "typescript", "esbuild"]) {
  const location = await realpath(path.join("node_modules", name));
  assert(location.startsWith(project + path.sep), `${name} 不得解析到作者目录之外`);
  const metadata = JSON.parse(await readFile(path.join(location, "package.json"), "utf8"));
  installed[name] = metadata.version;
  assert(!JSON.stringify(metadata.dependencies ?? {}).includes("workspace:"));
  if (name === "@tau/plugins") {
    assert(metadata.exports["./portable"]);
    for (const internal of [
      "./host",
      "./environment-host",
      "./node",
      "./backend-runtime",
      "./rendering",
    ])
      assert(!metadata.exports[internal], `宿主入口 ${internal} 不得公开给作者`);
  }
}
console.log(
  JSON.stringify({
    targets,
    installed,
    packageIntegrity: parsed.integrity,
    archiveSha256: createHash("sha256").update(archive).digest("hex"),
    workspaceLinks: false,
    legacyValidatorRejectsPortable: true,
  })
);
