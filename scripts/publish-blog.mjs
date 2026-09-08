import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import OSS from "ali-oss";

// 桌面端 publish-template-manager.ts 硬编码从该地址拉取版本信息，bucket/region 不可变更
const OSS_REGION = "oss-cn-shanghai";
const OSS_BUCKET = "release-bin";
const LATEST_OBJECT_KEY = "publish-template-latest.json";
const ZIP_OBJECT_KEY = version => `publish-template/blog-template-${version}.zip`;
const PUBLIC_BASE_URL = `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`;

// 必需文件清单与桌面端 REQUIRED_TEMPLATE_FILES 保持一致
const REQUIRED_TEMPLATE_FILES = [
  "src/templates/home/index.html",
  "src/templates/card/index.html",
  "src/templates/article/index.html",
  "src/templates/doc/index.html",
  "src/templates/list/index.html",
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const blogDir = join(root, "apps/blog");
const distDir = join(blogDir, "dist");
const packageFile = join(blogDir, "package.json");

function printHelp() {
  console.log(`用法: pnpm publish:blog [选项]

构建 apps/blog 并将模板 zip 发布到 OSS，更新桌面端拉取的 publish-template-latest.json。
默认将 apps/blog/package.json 的版本号 patch +1，全部成功后才回写版本号。

选项:
  --version x.y.z  直接指定发布版本
  --skip-build     跳过构建，使用现有 apps/blog/dist
  --dry-run        只执行本地流程（构建、校验、打包），不上传、不改版本号
  --force          远端已是同版本时仍强制覆盖（桌面端不会重新下载同版本）
  -h, --help       显示帮助

环境变量:
  ALI_OSS_ACCESS_ID   必填，阿里云 AccessKeyId
  ALI_OSS_ACCESS_KEY  必填，阿里云 AccessKeySecret`);
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
  if (!match) throw new Error(`blog/package.json 版本号格式无效: ${version}`);
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

async function fetchRemoteVersion(client) {
  try {
    const result = await client.get(LATEST_OBJECT_KEY);
    return JSON.parse(result.content.toString("utf8")).version ?? null;
  } catch (error) {
    if (error?.status === 404 || error?.code === "NoSuchKey") return null;
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  // 提前校验凭据，避免构建打包完成后才发现无法上传
  if (!options.dryRun) {
    requiredEnv("ALI_OSS_ACCESS_ID");
    requiredEnv("ALI_OSS_ACCESS_KEY");
  }

  const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
  const version = options.version ?? nextPatch(pkg.version);
  console.log(
    `▶ 发布版本: ${version}${options.version ? "" : `（当前 ${pkg.version}，patch +1）`}`
  );

  if (!options.skipBuild) {
    console.log("▶ 构建 blog ...");
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
      console.log("▶ --dry-run: 本地流程全部通过，跳过上传与版本号回写");
      return;
    }

    const client = new OSS({
      region: OSS_REGION,
      bucket: OSS_BUCKET,
      accessKeyId: requiredEnv("ALI_OSS_ACCESS_ID"),
      accessKeySecret: requiredEnv("ALI_OSS_ACCESS_KEY"),
      secure: true,
      timeout: 5 * 60_000,
    });

    const remoteVersion = await fetchRemoteVersion(client);
    if (remoteVersion === version && !options.force) {
      throw new Error(
        `远端 latest.json 已是版本 ${version}，桌面端不会重新下载同版本；请升版本或使用 --force 覆盖`
      );
    }

    console.log(`▶ 上传 ${ZIP_OBJECT_KEY(version)}（远端当前 ${remoteVersion ?? "无版本"}）...`);
    await client.put(ZIP_OBJECT_KEY(version), zipPath, {
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });

    // 先传 zip 再写 latest.json，保证 latest.json 指向的产物一定已存在
    const latestJson = `${JSON.stringify(
      { version, asset: { url: `${PUBLIC_BASE_URL}/${ZIP_OBJECT_KEY(version)}`, sha256 } },
      null,
      2
    )}\n`;
    console.log(`▶ 上传 ${LATEST_OBJECT_KEY} ...`);
    await client.put(LATEST_OBJECT_KEY, Buffer.from(latestJson), {
      headers: { "Cache-Control": "no-cache" },
    });

    pkg.version = version;
    writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

    console.log("✔ 发布完成");
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
