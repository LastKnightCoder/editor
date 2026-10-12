import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// 桌面端 publish-template-manager.ts 硬编码从 dl.xiongtao.life（R2）拉取版本信息；
// OSS 侧清单已冻结在迁移前版本（见 scripts/migrate-oss-to-r2.mjs），服务旧客户端长尾
const R2_BUCKET = "tau-release";
const PUBLIC_BASE_URL = "https://dl.xiongtao.life";
const LATEST_OBJECT_KEY = "publish-template-latest.json";
const ZIP_OBJECT_KEY = version => `publish-template/blog-template-${version}.zip`;

// 必需文件清单与桌面端 REQUIRED_TEMPLATE_FILES 保持一致
const REQUIRED_TEMPLATE_FILES = [
  "src/templates/home/index.html",
  "src/templates/card/index.html",
  "src/templates/article/index.html",
  "src/templates/doc/index.html",
  "src/templates/quest/index.html",
  "src/templates/list/index.html",
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const blogDir = join(root, "apps/blog");
const distDir = join(blogDir, "dist");
const packageFile = join(blogDir, "package.json");

function printHelp() {
  console.log(`用法: pnpm publish:blog [选项]

构建 apps/blog 并将模板 zip 发布到 R2（${PUBLIC_BASE_URL}），更新桌面端拉取的 publish-template-latest.json。
默认将 apps/blog/package.json 的版本号 patch +1，全部成功后才回写版本号。

选项:
  --version x.y.z  直接指定发布版本
  --skip-build     跳过构建，使用现有 apps/blog/dist
  --dry-run        只执行本地流程（构建、校验、打包），不上传、不改版本号
  --force          远端已是同版本时仍强制覆盖（桌面端不会重新下载同版本）
  -h, --help       显示帮助

环境变量:
  R2_ACCOUNT_ID        必填，Cloudflare Account ID
  R2_ACCESS_KEY_ID     必填，R2 API Token 的 Access Key ID
  R2_SECRET_ACCESS_KEY 必填，R2 API Token 的 Secret Access Key`);
}

function parseArgs(argv) {
  const options = { version: null, dryRun: false, skipBuild: false, force: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--version") {
      options.version = argv[index + 1];
      if (!options.version || !/^\d+\.\d+\.\d+$/.test(options.version)) {
        throw new Error("--version 需要形如 x.y.z 的版本号");
      }
      index++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--force") {
      options.force = true;
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

function nextPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error("blog/package.json 版本号格式无效: " + version);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

async function validateDist() {
  for (const file of REQUIRED_TEMPLATE_FILES) {
    const filePath = join(distDir, file);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new Error(`构建产物缺少必需文件: ${file}`);
    }
  }
  const assets = await readdir(join(distDir, "assets")).catch(() => []);
  if (assets.length === 0) {
    throw new Error("构建产物缺少 assets 目录或其为空");
  }
}

function createZip(zipPath) {
  rmSync(zipPath, { force: true });
  const zip = new AdmZip();
  // zip 根即 dist 内容，与桌面端解压后的校验结构一致
  zip.addLocalFolder(distDir, "");
  zip.writeZip(zipPath);
  const content = readFileSync(zipPath);
  return {
    sha256: createHash("sha256").update(content).digest("hex"),
    size: content.length,
  };
}

function createR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

async function fetchRemoteVersion(client) {
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: LATEST_OBJECT_KEY })
    );
    const json = JSON.parse(await result.Body.transformToString("utf8"));
    return json.version ?? null;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NoSuchKey") return null;
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  // 提前校验凭据，避免构建打包完成后才发现无法上传
  if (!options.dryRun) {
    requiredEnv("R2_ACCOUNT_ID");
    requiredEnv("R2_ACCESS_KEY_ID");
    requiredEnv("R2_SECRET_ACCESS_KEY");
  }

  const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
  const version = options.version ?? nextPatch(pkg.version);
  console.log(
    `▶ 发布版本: ${version}${options.version ? "" : `（当前 ${pkg.version}，patch +1）`}`
  );

  if (!options.skipBuild) {
    console.log(`▶ 构建 blog ...`);
    execFileSync("pnpm", ["--filter", "blog", "build"], {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  }

  await validateDist();

  const zipPath = join(tmpdir(), `blog-template-${version}.zip`);
  try {
    const { sha256, size } = createZip(zipPath);
    console.log(
      `▶ 打包完成: ${(size / 1024 / 1024).toFixed(2)} MB，sha256 ${sha256.slice(0, 12)}...`
    );

    if (options.dryRun) {
      console.log(`▶ --dry-run: 本地流程全部通过，跳过上传与版本号回写`);
      return;
    }

    const client = createR2Client();

    const remoteVersion = await fetchRemoteVersion(client);
    if (remoteVersion === version && !options.force) {
      throw new Error(
        `远端 latest.json 已是版本 ${version}，桌面端不会重新下载同版本；请升版本或使用 --force 覆盖`
      );
    }

    console.log(`▶ 上传 ${ZIP_OBJECT_KEY(version)}（远端当前 ${remoteVersion ?? "无版本"}）...`);
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: ZIP_OBJECT_KEY(version),
      Body: createReadStream(zipPath),
      ContentType: "application/zip",
      CacheControl: "public, max-age=31536000, immutable",
    }));

    // 先传 zip 再写 latest.json，保证 latest.json 指向的产物一定已存在
    const latestJson = `${JSON.stringify(
      { version, asset: { url: `${PUBLIC_BASE_URL}/${ZIP_OBJECT_KEY(version)}`, sha256 } },
      null,
      2
    )}\n`;
    console.log(`▶ 上传 ${LATEST_OBJECT_KEY} ...`);
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: LATEST_OBJECT_KEY,
      Body: latestJson,
      ContentType: "application/json",
      CacheControl: "no-cache",
    }));

    pkg.version = version;
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

    console.log(`✔ 发布完成`);
    console.log(`  版本: ${version}`);
    console.log(`  模板: ${PUBLIC_BASE_URL}/${ZIP_OBJECT_KEY(version)}`);
    console.log(`  版本信息: ${PUBLIC_BASE_URL}/${LATEST_OBJECT_KEY}`);
    console.log(`  sha256: ${sha256}`);
  } finally {
    rmSync(zipPath, { force: true });
  }
}

main().catch(error => {
  console.error(`✖ 发布失败: ${error?.message ?? error}`);
  process.exitCode = 1;
});
