import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rename, rm, stat, cp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  isPackagePath,
  readFixtureManifest,
  readPluginFixtures,
} from "./test-support/package-fixtures.ts";

const [archive, sourceRevision, repository, sourcePatchFile] = process.argv.slice(2);
if (
  !archive ||
  !/^[a-f0-9]{40}$/.test(sourceRevision ?? "") ||
  !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repository ?? "")
)
  throw new Error(
    "用法：node scripts/plugins/pin-test-fixture.mjs <插件 ZIP> <作者完整提交 SHA> <GitHub 仓库 URL> [相对该提交的源码补丁]"
  );
const root = path.resolve(import.meta.dirname, "../../tests/fixtures/plugins");
const config = path.join(root, "catalog.json");
const content = await readFile(archive);
const hash = data => createHash("sha256").update(data).digest("hex");
const files = new Map();
const entries = new AdmZip(content).getEntries().filter(entry => !entry.isDirectory);
const manifestEntry = entries.find(entry => /(^|\/)manifest\.json$/.test(entry.entryName));
if (!manifestEntry) throw new Error("ZIP 缺少 manifest.json");
const manifest = readFixtureManifest(JSON.parse(manifestEntry.getData().toString("utf8")));
const prefix = manifestEntry.entryName.slice(0, -"manifest.json".length);
for (const entry of entries) {
  const name = entry.entryName.slice(prefix.length);
  if (!entry.entryName.startsWith(prefix) || !isPackagePath(name) || files.has(name))
    throw new Error("ZIP 文件布局无效或重复");
  files.set(name, entry.getData());
}
const artifact = `releases/${manifest.id}/${manifest.version}`;
const sourcePatch = sourcePatchFile ? await readFile(sourcePatchFile) : undefined;
if (sourcePatch && !sourcePatch.length) throw new Error("源码补丁不能为空");
const patchPath = `sources/${manifest.id}/${manifest.version}.patch`;
const release = {
  repository,
  artifact,
  id: manifest.id,
  version: manifest.version,
  sourceRevision,
  ...(sourcePatch ? { sourcePatch: { file: patchPath, sha256: hash(sourcePatch) } } : {}),
  archiveSha256: hash(content),
  files: Object.fromEntries(
    [...files].sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => [file, hash(bytes)])
  ),
};
const temporary = await mkdtemp(path.join(os.tmpdir(), "tau-plugin-release-"));
try {
  const staged = path.join(temporary, artifact);
  await mkdir(staged, { recursive: true });
  for (const [name, bytes] of files) {
    await mkdir(path.dirname(path.join(staged, name)), { recursive: true });
    await writeFile(path.join(staged, name), bytes);
  }
  const check = path.join(temporary, "distribution.json");
  if (sourcePatch) {
    await mkdir(path.dirname(path.join(temporary, patchPath)), { recursive: true });
    await writeFile(path.join(temporary, patchPath), sourcePatch);
  }
  await writeFile(check, JSON.stringify([release]));
  await readPluginFixtures(check);
  const destination = path.join(root, artifact);
  if (
    await stat(destination).then(
      () => true,
      error => {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    )
  )
    throw new Error("该版本产物已存在，请提升插件版本后再固定");
  const distribution = JSON.parse(await readFile(config, "utf8"));
  const index = distribution.findIndex(entry => entry.id === manifest.id);
  if (index < 0) distribution.push(release);
  else distribution[index] = release;
  await mkdir(path.dirname(destination), { recursive: true });
  // 临时目录可能跨磁盘，先复制到目标目录旁再原子换名。
  const staging = destination + ".pending";
  try {
    await cp(staged, staging, { recursive: true, errorOnExist: true, force: false });
    await rename(staging, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  const next = config + ".pending";
  if (sourcePatch) {
    await mkdir(path.dirname(path.join(root, patchPath)), { recursive: true });
    await writeFile(path.join(root, patchPath), sourcePatch, { flag: "wx" });
  }
  await writeFile(next, JSON.stringify(distribution, null, 2) + "\n");
  await rename(next, config);
  console.log(
    `已更新测试包 ${manifest.id}@${manifest.version}；请检查并提交 ${artifact} 与 catalog.json。`
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
