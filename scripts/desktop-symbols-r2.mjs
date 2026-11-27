import { mkdtemp, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createR2Client, R2_BUCKET, requiredEnv } from "./r2-client.mjs";
import {
  assertBuildId,
  collectSymbols,
  fileHash,
  packSymbols,
  unpackSymbols,
  SYMBOLS_MAX_BYTES,
} from "./desktop-symbols-archive.mjs";

const defaultSymbols = fileURLToPath(
  new URL("../apps/desktop/output/diagnostics-symbols/", import.meta.url)
);
const prefix = buildId => `desktop-symbols/${assertBuildId(buildId)}`;

export function symbolsBucket(value) {
  if (!value || value === R2_BUCKET || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value))
    throw new Error(`请配置独立私有桶 R2_SYMBOLS_BUCKET，不能使用公开下载桶 ${R2_BUCKET}`);
  return value;
}

function checkRemote(value, buildId) {
  if (
    value?.schemaVersion !== 1 ||
    value.buildId !== buildId ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
    !/^[a-f0-9]{64}$/.test(value.archive?.sha256) ||
    value.archive.key !== `${prefix(buildId)}/symbols-${value.archive.sha256}.zip` ||
    !Number.isInteger(value.archive.bytes) ||
    value.archive.bytes <= 0 ||
    value.archive.bytes > SYMBOLS_MAX_BYTES
  )
    throw new Error("R2 归档描述无效");
  return value;
}

export async function uploadSymbols({ symbolsRoot, buildId, dryRun = false, client }) {
  const symbols = await collectSymbols(symbolsRoot, buildId);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "tau-symbols-upload-"));
  try {
    const archive = path.join(temporary, "symbols.zip");
    const packed = await packSymbols(symbols, archive);
    const descriptor = {
      schemaVersion: 1,
      buildId,
      version: symbols.version,
      revision: symbols.revision,
      fingerprint: symbols.fingerprint,
      fileCount: symbols.files.length,
      totalBytes: symbols.totalBytes,
      archive: { key: `${prefix(buildId)}/symbols-${packed.sha256}.zip`, ...packed },
    };
    if (dryRun) return { ...descriptor, dryRun: true };
    const remote = await client.getText(`${prefix(buildId)}/manifest.json`);
    const existing = text => {
      const value = checkRemote(JSON.parse(text), buildId);
      if (value.fingerprint !== descriptor.fingerprint)
        throw new Error("同一 buildId 已有不同归档，拒绝覆盖；请核对构建产物");
      return value;
    };
    if (remote) return existing(remote);
    await client.putFile(descriptor.archive.key, archive, "private, no-store");
    // 描述文件最后提交；中断上传不会被下载端误认为完整归档。
    try {
      await client.putText(
        `${prefix(buildId)}/manifest.json`,
        JSON.stringify(descriptor),
        "private, no-store",
        { ifNoneMatch: "*" }
      );
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 412 && error?.name !== "PreconditionFailed")
        throw error;
      const winner = await client.getText(`${prefix(buildId)}/manifest.json`);
      if (!winner) throw error;
      return existing(winner);
    }
    return descriptor;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function downloadSymbols({ symbolsRoot, buildId, client }) {
  assertBuildId(buildId);
  const text = await client.getText(`${prefix(buildId)}/manifest.json`);
  if (!text) throw new Error(`R2 中没有构建 ${buildId}`);
  const descriptor = checkRemote(JSON.parse(text), buildId);
  const target = path.resolve(symbolsRoot, buildId);
  const existing = await stat(target).catch(error => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (existing) {
    const local = await collectSymbols(symbolsRoot, buildId);
    if (local.fingerprint !== descriptor.fingerprint)
      throw new Error("本地同名构建与 R2 不一致，拒绝覆盖");
    return { directory: target, reused: true };
  }
  await mkdir(symbolsRoot, { recursive: true });
  const temporary = await mkdtemp(path.join(symbolsRoot, ".symbols-download-"));
  try {
    const archive = path.join(temporary, "symbols.zip");
    if (
      !(await client.getFile(descriptor.archive.key, archive, descriptor.archive.bytes)) ||
      (await stat(archive)).size !== descriptor.archive.bytes ||
      (await fileHash(archive)) !== descriptor.archive.sha256
    )
      throw new Error("R2 压缩归档缺失或 SHA-256 不一致");
    const extracted = path.join(temporary, buildId);
    const fileCount = await unpackSymbols(archive, extracted);
    const restored = await collectSymbols(temporary, buildId);
    if (restored.files.length !== fileCount || restored.fingerprint !== descriptor.fingerprint)
      throw new Error("解压后的构建清单不一致或包含额外文件");
    await rename(extracted, target);
    return { directory: target, reused: false };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function parseArgs(args) {
  const options = { action: args[0], symbolsRoot: defaultSymbols, dryRun: false };
  for (let i = 1; i < args.length; i++) {
    const key = args[i];
    if (key === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const field = { "--symbols": "symbolsRoot", "--build-id": "buildId" }[key];
    if (!field || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`参数无效：${key}`);
    options[field] = args[++i];
  }
  if (!["upload", "download"].includes(options.action))
    throw new Error("请指定 upload 或 download");
  if (options.action === "download" && (!options.buildId || options.dryRun))
    throw new Error("download 必须提供 --build-id，且不支持 --dry-run");
  return options;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`用法：
  pnpm publish:desktop-symbols [--build-id ID] [--symbols 目录] [--dry-run]
  pnpm fetch:desktop-symbols --build-id ID [--symbols 目录]

上传默认读取本机 latest.json；按 buildId 上传 ZIP 与最后提交的描述文件。
下载验证归档与每份 map 的 SHA-256 后恢复到本地 buildId 目录，不覆盖不同内容。
--dry-run 只执行本地校验与打包，不需要 R2 凭据。
环境变量：R2_ACCOUNT_ID、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_SYMBOLS_BUCKET。
R2_SYMBOLS_BUCKET 必须是独立私有桶；脚本不创建桶、不启用公开访问。`);
    return;
  }
  const options = parseArgs(args);
  if (!options.buildId)
    options.buildId = JSON.parse(
      await readFile(path.join(options.symbolsRoot, "latest.json"), "utf8")
    ).buildId;
  const client = options.dryRun
    ? undefined
    : createR2Client({ bucket: symbolsBucket(requiredEnv("R2_SYMBOLS_BUCKET")) });
  if (options.action === "upload") {
    const result = await uploadSymbols({ ...options, client });
    console.log(
      `${options.dryRun ? "本地校验打包通过" : "R2 上传完成"}：${result.buildId}，${result.fileCount} 个文件，ZIP ${(result.archive.bytes / 1024 / 1024).toFixed(1)} MiB`
    );
    console.log(`对象：${result.archive.key}`);
  } else {
    const result = await downloadSymbols({ ...options, client });
    console.log(`${result.reused ? "已存在相同构建" : "R2 下载校验完成"}：${result.directory}`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
