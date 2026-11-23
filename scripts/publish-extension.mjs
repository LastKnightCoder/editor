import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import {
  EXTENSION_BROWSER,
  EXTENSION_MANIFEST_NAME,
  EXTENSION_PREFIX,
  buildExtensionManifest,
  extensionZipName,
} from "./extension-release.mjs";
import { compareVersions } from "./release-notes.mjs";
import { R2_ENV_KEYS, R2_PUBLIC_BASE_URL, createR2Client, requiredEnv } from "./r2-client.mjs";
import { runPnpm } from "./run-pnpm.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = join(root, "apps/browser-extension");
const outputDir = join(extensionDir, ".output");
const packageFile = join(extensionDir, "package.json");

function printHelp() {
  console.log(`用法: pnpm publish:extension [选项]

构建「Tau 伴读」浏览器扩展，把 zip 发布到 Cloudflare R2（${R2_PUBLIC_BASE_URL}/${EXTENSION_PREFIX}），
更新官网下载区读取的 ${EXTENSION_MANIFEST_NAME}。用户下载后经浏览器开发者模式的「加载未打包的扩展程序」安装。
版本号默认取 apps/browser-extension/package.json 当前值。
指定 --version 时先回写版本号再构建；构建或上传失败时版本号不回滚，修复后可用 --skip-build 重试。

选项:
  --version x.y.z  指定发布版本并回写 apps/browser-extension/package.json
  --skip-build     跳过构建，使用现有 zip
  --dry-run        只执行本地流程（构建、打包、校验），不上传
  --force          线上已是同版本时仍强制覆盖
  -h, --help       显示帮助

环境变量:
  R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY  上传凭据`);
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

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** 发布包要能直接「加载未打包的扩展程序」：manifest.json 必须在压缩包根目录，版本与发布版本一致 */
function readPackagedManifest(zipFile, version) {
  const entry = new AdmZip(zipFile).getEntry("manifest.json");
  if (!entry) throw new Error("压缩包根目录没有 manifest.json，无法「加载未打包的扩展程序」");
  const packagedVersion = JSON.parse(entry.getData().toString("utf8")).version;
  if (packagedVersion !== version) {
    throw new Error(`压缩包里扩展的版本是 ${packagedVersion}，与发布版本 ${version} 不一致`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  // 提前校验凭据，避免构建完成后才发现无法上传
  if (!options.dryRun) {
    for (const key of R2_ENV_KEYS) requiredEnv(key);
  }

  const pkg = readJson(packageFile);
  const version = options.version ?? pkg.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`apps/browser-extension/package.json 的版本号 ${version} 不是 x.y.z`);
  }
  console.log(`▶ 发布浏览器扩展版本: ${version}`);
  // dry-run 不回写版本号，所以 --version 只在与当前版本相同时能走通；要升版本，先手动改好再演练
  if (options.version && !options.dryRun) {
    console.log(`▶ 回写版本号 ${pkg.version} → ${version} ...`);
    writeJson(packageFile, { ...pkg, version });
  }

  if (!options.skipBuild) {
    console.log(`▶ 构建并打包扩展 ...`);
    runPnpm(["--filter", "browser-extension", "exec", "wxt", "zip", "-b", EXTENSION_BROWSER], {
      cwd: root,
      stdio: "inherit",
    });
  } else {
    console.log(`▶ --skip-build: 跳过构建，使用现有 zip`);
  }

  const zipFile = join(outputDir, extensionZipName(version));
  if (!existsSync(zipFile)) {
    throw new Error(
      `没有找到构建产物 ${relative(root, zipFile)}。请先构建或去掉 --skip-build；--dry-run 不回写版本号，--version 须与 package.json 当前版本相同`
    );
  }
  readPackagedManifest(zipFile, version);

  const bytes = readFileSync(zipFile);
  const manifest = buildExtensionManifest({
    version,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    now: new Date(),
  });
  const manifestFile = join(outputDir, EXTENSION_MANIFEST_NAME);
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`▶ ${manifest.file}（${(manifest.size / 1024 / 1024).toFixed(2)} MB）`);
  console.log(`  SHA-256 ${manifest.sha256}`);

  if (options.dryRun) {
    console.log(`▶ --dry-run: 本地流程全部通过，产物在 ${relative(root, outputDir)}，跳过上传`);
    return;
  }

  const client = createR2Client();
  const manifestKey = `${EXTENSION_PREFIX}/${EXTENSION_MANIFEST_NAME}`;
  const remoteText = await client.getText(manifestKey);
  if (remoteText) {
    const remoteVersion = JSON.parse(remoteText).version;
    const diff = compareVersions(version, remoteVersion);
    if (diff === 0 && !options.force) {
      throw new Error(`线上已是版本 ${version}，同版本的包已分发出去；请升版本或使用 --force 覆盖`);
    }
    if (diff < 0) {
      throw new Error(`线上版本 ${remoteVersion} 高于本次 ${version}，不允许降级发布`);
    }
  }

  // 先传 zip 再写清单，保证清单指向的文件一定已存在
  console.log(`▶ 上传 ${EXTENSION_PREFIX}/${manifest.file} ...`);
  await client.putFile(
    `${EXTENSION_PREFIX}/${manifest.file}`,
    zipFile,
    "public, max-age=31536000, immutable"
  );
  console.log(`▶ 上传 ${manifestKey} ...`);
  await client.putText(manifestKey, JSON.stringify(manifest), "no-cache");

  console.log(`✔ 发布完成`);
  console.log(`  下载地址: ${R2_PUBLIC_BASE_URL}/${EXTENSION_PREFIX}/${manifest.file}`);
  console.log(`  版本信息: ${R2_PUBLIC_BASE_URL}/${manifestKey}`);
}

main().catch(error => {
  console.error(`✖ 发布失败: ${error?.message ?? error}`);
  process.exitCode = 1;
});
