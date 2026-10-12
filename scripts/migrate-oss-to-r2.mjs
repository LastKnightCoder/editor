import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// 迁移源：OSS release-bin（公开读，匿名下载即可）；迁移目的地经 dl.xiongtao.life（R2 自定义域）对外
const OSS_BASE_URL = "https://release-bin.oss-cn-shanghai.aliyuncs.com";
const R2_PUBLIC_BASE_URL = "https://dl.xiongtao.life";
const MANIFEST_KEYS = ["ffmpeg-services-latest.json", "publish-template-latest.json"];

const CONTENT_TYPES = {
  ".json": "application/json",
  ".gz": "application/gzip",
  ".zip": "application/zip",
};

function printHelp() {
  console.log(`用法: node scripts/migrate-oss-to-r2.mjs --bucket <name> [选项]

一次性把 OSS release-bin 上的 ffmpeg / publish-template 资源迁移到 R2：
拉取两个 latest.json 清单，解析其中引用的全部资源，下载后上传到 R2，
清单内的 OSS URL 同步改写为 R2 域名。desktop/ 安装包不迁移——存量客户端
的更新源钉死在 OSS（见 publish-desktop.mjs），R2 侧不需要历史产物。
脚本幂等，失败修复后可直接重跑。

选项:
  --bucket <name>  目标 R2 bucket 名（必填，--dry-run 除外）
  --dry-run        只拉清单并列出迁移集，不下载、不上传
  -h, --help       显示帮助

环境变量:
  R2_ACCOUNT_ID        必填，Cloudflare Account ID（R2 概览页）
  R2_ACCESS_KEY_ID     必填，R2 API Token 的 Access Key ID
  R2_SECRET_ACCESS_KEY 必填，R2 API Token 的 Secret Access Key`);
}

function parseArgs(argv) {
  const options = { bucket: process.env.R2_BUCKET ?? null, dryRun: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--bucket") {
      options.bucket = argv[index + 1];
      if (!options.bucket) throw new Error("--bucket 需要一个 bucket 名");
      index++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return options;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`拉取 ${url} 失败: HTTP ${response.status}`);
  return response.json();
}

// 深度遍历 JSON，收集所有指向 OSS 的 URL 并改写为 R2 域名（返回 [改写后的对象, 引用的 OSS key 列表]）
function rewriteManifest(node, ossUrls) {
  if (typeof node === "string") {
    if (node.startsWith(`${OSS_BASE_URL}/`)) {
      ossUrls.push(node.slice(OSS_BASE_URL.length + 1));
      return `${R2_PUBLIC_BASE_URL}/${node.slice(OSS_BASE_URL.length + 1)}`;
    }
    return node;
  }
  if (Array.isArray(node)) return node.map(item => rewriteManifest(item, ossUrls));
  if (node && typeof node === "object") {
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      result[key] = rewriteManifest(value, ossUrls);
    }
    return result;
  }
  return node;
}

async function downloadTo(url, filePath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`下载 ${url} 失败: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
}

function sha256Of(filePath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash("sha256");
    createReadStream(filePath)
      .on("data", chunk => hash.update(chunk))
      .on("end", () => resolvePromise(hash.digest("hex")))
      .on("error", rejectPromise);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.bucket && !options.dryRun) {
    throw new Error("缺少 --bucket（或环境变量 R2_BUCKET）");
  }
  if (!options.dryRun) {
    requiredEnv("R2_ACCOUNT_ID");
    requiredEnv("R2_ACCESS_KEY_ID");
    requiredEnv("R2_SECRET_ACCESS_KEY");
  }

  console.log("▶ 拉取 OSS 清单 ...");
  const manifests = [];
  const assetKeys = new Set();
  for (const key of MANIFEST_KEYS) {
    const original = await fetchJson(`${OSS_BASE_URL}/${key}`);
    const referenced = [];
    const rewritten = rewriteManifest(original, referenced);
    manifests.push({ key, rewritten, sha256: original.asset?.sha256 ?? null });
    for (const assetKey of referenced) assetKeys.add(assetKey);
    console.log(`  ${key}: 引用 ${referenced.length} 个资源`);
  }

  // publish-template 清单带 zip 的 sha256，用它校验下载完整性
  const templateManifest = manifests.find(m => m.key === "publish-template-latest.json");
  const templateZipKey = templateManifest.rewritten.asset?.url?.slice(R2_PUBLIC_BASE_URL.length + 1) ?? null;

  const plan = [
    ...[...assetKeys].map(key => ({
      key,
      isManifest: false,
      verifySha256: key === templateZipKey ? templateManifest.sha256 : null,
    })),
    ...manifests.map(manifest => ({
      key: manifest.key,
      isManifest: true,
      verifySha256: null,
      rewritten: manifest.rewritten,
    })),
  ];

  const workDir = await mkdtemp(join(tmpdir(), "oss-to-r2-"));
  try {
    let totalBytes = 0;
    console.log("▶ 迁移集（%d 个文件）:", plan.length);
    for (const item of plan) {
      const filePath = join(workDir, item.key.replaceAll("/", "_"));
      await downloadTo(`${OSS_BASE_URL}/${item.key}`, filePath);
      const { size } = await stat(filePath);
      totalBytes += size;
      console.log(`  ${item.key}（${(size / 1024 / 1024).toFixed(2)} MB）`);

      if (item.verifySha256) {
        const actual = await sha256Of(filePath);
        if (actual !== item.verifySha256) {
          throw new Error(
            `${item.key} sha256 不匹配（清单 ${item.verifySha256.slice(0, 12)}... / 实际 ${actual.slice(0, 12)}...）`
          );
        }
        console.log(`  ${item.key} sha256 校验通过`);
      }
      item.filePath = filePath;
      item.size = size;
    }
    console.log(`  合计 ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

    if (options.dryRun) {
      console.log("▶ --dry-run: 清单解析与下载校验全部通过，跳过上传");
      return;
    }

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
      },
    });

    // 先传资源再传清单，保证清单指向的产物一定已存在（与 publish 脚本同一约定）
    console.log(`▶ 上传到 R2 bucket ${options.bucket} ...`);
    for (const item of plan) {
      const cacheControl = item.isManifest
        ? "no-cache"
        : "public, max-age=31536000, immutable";
      const body = item.isManifest
        ? JSON.stringify(item.rewritten, null, 2)
        : createReadStream(item.filePath);
      await client.send(new PutObjectCommand({
        Bucket: options.bucket,
        Key: item.key,
        Body: body,
        ContentType: CONTENT_TYPES[extname(item.key)] ?? "application/octet-stream",
        CacheControl: cacheControl,
      }));
      console.log(`  ✔ ${item.key}`);
    }

    console.log("▶ 验证公网下载 ...");
    for (const item of plan) {
      const response = await fetch(`${R2_PUBLIC_BASE_URL}/${item.key}`, { method: "HEAD" });
      if (!response.ok) {
        throw new Error(`验证失败: ${R2_PUBLIC_BASE_URL}/${item.key} HTTP ${response.status}`);
      }
    }
    console.log(`✔ 迁移完成，共 ${plan.length} 个文件，均经 ${R2_PUBLIC_BASE_URL} 可访问`);
    console.log("  注意: desktop/ 安装包未迁移（过渡版本策略，OSS 侧继续服务存量客户端）");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`✖ 迁移失败: ${error?.message ?? error}`);
  process.exitCode = 1;
});
