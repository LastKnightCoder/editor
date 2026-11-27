import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertBuildId, fileHash } from "./desktop-symbols-archive.mjs";

const receiptFile = (directory, name) => path.join(directory, ".build-receipts", `${name}.json`);
const safeName = name =>
  typeof name === "string" &&
  name === path.basename(name) &&
  name !== "." &&
  name !== ".." &&
  !/[\\/]/.test(name);

export async function recordArtifactBuild({ file, buildId, version, platform, arch }) {
  assertBuildId(buildId);
  const name = path.basename(file);
  if (!safeName(name) || !name.includes(`-v${version}-`)) throw new Error("安装包名称与版本不一致");
  const info = await stat(file);
  if (!info.isFile() || !info.size) throw new Error(`安装包为空：${name}`);
  const value = {
    schemaVersion: 1,
    file: name,
    buildId,
    version,
    platform,
    arch,
    bytes: info.size,
    sha512: await fileHash(file, "sha512"),
  };
  const target = receiptFile(path.dirname(file), name);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  return value;
}

export async function readArtifactBuilds({ releaseDir, version, artifacts }) {
  const builds = new Map();
  for (const name of artifacts) {
    if (!safeName(name)) throw new Error("安装包名称无效");
    const value = await readFile(receiptFile(releaseDir, name), "utf8")
      .then(JSON.parse)
      .catch(error => {
        if (error.code === "ENOENT")
          throw new Error(`${name} 缺少构建绑定，请重新构建；不能按版本号或 latest.json 猜测 map`);
        throw error;
      });
    const info = await stat(path.join(releaseDir, name));
    if (
      value.schemaVersion !== 1 ||
      value.file !== name ||
      value.version !== version ||
      !name.includes(`-v${version}-`) ||
      value.bytes !== info.size ||
      value.sha512 !== (await fileHash(path.join(releaseDir, name), "sha512"))
    )
      throw new Error(`${name} 与构建绑定不一致，请重新构建`);
    assertBuildId(value.buildId);
    const files = builds.get(value.buildId) ?? [];
    files.push(name);
    builds.set(value.buildId, files);
  }
  if (!builds.size) throw new Error("没有可发布的构建绑定");
  return [...builds].map(([buildId, files]) => ({ buildId, files }));
}
