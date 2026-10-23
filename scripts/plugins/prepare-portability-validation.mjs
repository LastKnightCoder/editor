import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const AdmZip = require("adm-zip");
const output = path.join(root, "output/plugin-portability-validation");
await mkdir(output, { recursive: true });
const report = JSON.parse(
  await readFile(
    process.argv[2] ?? path.join(root, "output/plugin-phase-a/author-frozen-report.json"),
    "utf8"
  )
);
if (report.status !== "passed") throw new Error("作者验证尚未通过");
const counter = new AdmZip(report.artifact.archive);
const counterPrefix =
  counter
    .getEntries()
    .find(entry => entry.entryName.endsWith("/manifest.json"))
    ?.entryName.replace(/manifest\.json$/, "") ?? "";
const counterManifest = JSON.parse(counter.readAsText(counterPrefix + "manifest.json"));
const abcRoot = path.join(root, "tests/fixtures/plugins/releases/tau.abc/0.1.0");
const abcManifest = JSON.parse(await readFile(path.join(abcRoot, "manifest.json"), "utf8"));
delete abcManifest.minAppVersion;
Object.assign(abcManifest, {
  formatVersion: 3,
  platform: "portable",
  profile: "web-v1",
  targets: Object.fromEntries(
    ["desktop", "android", "ios"].map(platform => [
      platform,
      {
        minAppVersion: platform === "desktop" ? "0.59.0" : "0.2.0",
        required: ["editor", "editorCodecs", "sourceEditor"],
        optional: [],
        elements: { abc: "edit" },
      },
    ])
  ),
});
const abc = new AdmZip();
abc.addFile("manifest.json", Buffer.from(JSON.stringify(abcManifest, null, 2)));
for (const file of Object.keys(abcManifest.integrity))
  abc.addFile(file, await readFile(path.join(abcRoot, file)));
for (const entry of abc.getEntries()) entry.header.time = new Date(1980, 0, 1);
const sources = [];
const artifacts = [];
for (const [archive, manifest, prefix] of [
  [counter, counterManifest, counterPrefix],
  [abc, abcManifest, ""],
]) {
  const file = `${manifest.id}-${manifest.version}.zip`;
  const bytes = archive.toBuffer();
  await writeFile(path.join(output, file), bytes);
  const directory = path.join(output, "desktop", manifest.id);
  await mkdir(directory, { recursive: true });
  for (const entry of archive.getEntries()) {
    if (entry.isDirectory) continue;
    const target = path.join(directory, entry.entryName.slice(prefix.length));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, entry.getData());
  }
  sources.push({
    id: manifest.id,
    version: manifest.version,
    url: `http://127.0.0.1:2430/${file}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
  });
  artifacts.push({
    manifest,
    code: archive.readAsText(prefix + manifest.main),
    ...(manifest.styles ? { css: archive.readAsText(prefix + manifest.styles) } : {}),
  });
}
await writeFile(
  path.join(output, "desktop/.enabled.json"),
  JSON.stringify(sources.map(source => source.id))
);
await writeFile(path.join(output, "sources.json"), JSON.stringify(sources, null, 2));
await writeFile(path.join(output, "artifacts.json"), JSON.stringify(artifacts));
console.log(JSON.stringify({ output, sources }, null, 2));
