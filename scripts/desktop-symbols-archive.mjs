import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

export const SYMBOLS_MAX_BYTES = 512 * 1024 * 1024;
const targets = ["renderer", "main", "preload"];
const digest = value => createHash("sha256").update(value).digest("hex");
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function assertBuildId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(value))
    throw new Error("无效的 buildId");
  return value;
}

export async function fileHash(file, algorithm = "sha256") {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function checkedFile(directory, name, maxBytes) {
  const file = path.join(directory, name);
  const resolved = await realpath(file);
  if ((await lstat(file)).isSymbolicLink() || !resolved.startsWith(`${directory}${path.sep}`))
    throw new Error(`归档文件不能指向目录外：${name}`);
  const info = await stat(file);
  if (!info.isFile() || info.size > maxBytes) throw new Error(`归档文件无效或超过预算：${name}`);
  return { name, file, bytes: info.size, sha256: await fileHash(file) };
}

export async function collectSymbols(symbolsRoot, buildId) {
  assertBuildId(buildId);
  const directory = await realpath(path.join(symbolsRoot, buildId));
  const files = [],
    names = new Set();
  let version,
    revision,
    totalBytes = 0;
  for (const target of targets) {
    const manifest = await checkedFile(directory, `manifest-${target}.json`, 2 * 1024 * 1024);
    const value = JSON.parse(await readFile(manifest.file, "utf8"));
    if (
      value.schemaVersion !== 1 ||
      value.buildId !== buildId ||
      value.target !== target ||
      typeof value.version !== "string" ||
      typeof value.revision !== "string" ||
      !value.files ||
      typeof value.files !== "object" ||
      Array.isArray(value.files)
    )
      throw new Error(`构建清单无效：${manifest.name}`);
    version ??= value.version;
    revision ??= value.revision;
    if (value.version !== version || value.revision !== revision)
      throw new Error("三个目标的版本或修订不一致");
    const entries = Object.entries(value.files);
    if (!entries.length || entries.length > 10_000 || !entries.some(([, entry]) => entry?.map))
      throw new Error(`构建清单缺少源码映射：${target}`);
    files.push(manifest);
    totalBytes += manifest.bytes;
    for (const [key, entry] of entries) {
      if (
        !new RegExp(`^${target}/[A-Za-z0-9_./-]+$`).test(key) ||
        key.split("/").some(part => !part || part === "." || part === "..") ||
        !validHash(entry?.sha256)
      )
        throw new Error(`产物条目无效：${key}`);
      if (entry.unmapped === "generated-code" && !entry.map) continue;
      if (entry.map !== `${key}.map` || !validHash(entry.mapSha256) || names.has(entry.map))
        throw new Error(`映射条目无效：${key}`);
      names.add(entry.map);
      const file = await checkedFile(directory, entry.map, SYMBOLS_MAX_BYTES);
      if (file.sha256 !== entry.mapSha256) throw new Error(`映射 SHA-256 不一致：${entry.map}`);
      files.push(file);
      totalBytes += file.bytes;
      if (totalBytes > SYMBOLS_MAX_BYTES) throw new Error("构建归档超过 512 MiB");
    }
  }
  files.sort((a, b) => (a.name === b.name ? 0 : a.name < b.name ? -1 : 1));
  const fingerprint = digest(JSON.stringify(files.map(({ name, sha256 }) => [name, sha256])));
  return { directory, buildId, version, revision, files, totalBytes, fingerprint };
}

export async function packSymbols(symbols, archive) {
  const zip = new AdmZip();
  for (const file of symbols.files) {
    const data = await readFile(file.file);
    if (digest(data) !== file.sha256) throw new Error(`打包期间映射发生变化：${file.name}`);
    zip.addFile(file.name, data);
  }
  await zip.writeZipPromise(archive);
  const bytes = (await stat(archive)).size;
  if (bytes > SYMBOLS_MAX_BYTES) throw new Error("压缩归档超过 512 MiB");
  return { bytes, sha256: await fileHash(archive) };
}

export async function unpackSymbols(archive, directory) {
  const zip = new AdmZip(archive);
  const entries = zip.getEntries(),
    names = new Set();
  let totalBytes = 0;
  if (!entries.length || entries.length > 30_003) throw new Error("ZIP 文件数量无效");
  for (const entry of entries) {
    const name = entry.entryName;
    if (
      entry.isDirectory ||
      !/^(manifest-(renderer|main|preload)\.json|(renderer|main|preload)\/[A-Za-z0-9_./-]+\.map)$/.test(
        name
      ) ||
      name.split("/").some(part => !part || part === "." || part === "..") ||
      names.has(name) ||
      ((entry.attr >>> 16) & 0xf000) === 0xa000
    )
      throw new Error(`ZIP 条目无效：${name}`);
    names.add(name);
    totalBytes += entry.header.size;
    if (totalBytes > SYMBOLS_MAX_BYTES) throw new Error("解压预算超过 512 MiB");
  }
  for (const entry of entries) {
    const file = path.join(directory, entry.entryName);
    await mkdir(path.dirname(file), { recursive: true });
    const data = entry.getData();
    if (data.length !== entry.header.size) throw new Error("ZIP 条目长度不符");
    await writeFile(file, data, { flag: "wx" });
  }
  return entries.length;
}
