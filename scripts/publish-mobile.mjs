import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReleaseNote, compareVersions, releaseNotesUpTo } from "./release-notes.mjs";
import { R2_ENV_KEYS, R2_PUBLIC_BASE_URL, createR2Client, requiredEnv } from "./r2-client.mjs";
import {
  ANDROID_MANIFEST_NAME,
  ANDROID_PACKAGE_NAME,
  ANDROID_PREFIX,
  androidApkName,
  assertPublishable,
  assertVersionsAligned,
  buildAndroidManifest,
  findMissingJniMethods,
  parseBadging,
  parseJniKeepRules,
  parseSignerDigest,
  readMobileVersions,
  writeMobileVersion,
} from "./mobile-release.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobileDir = join(root, "apps/mobile");
const releaseNotesDir = join(mobileDir, "release-notes");
const outputDir = join(mobileDir, "release");
const jniRulesFile = join(mobileDir, "src-tauri/gen/android/app/proguard-jni.pro");
const builtApk = join(
  mobileDir,
  "src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk"
);

function printHelp() {
  console.log(`用法: pnpm publish:mobile [选项]

构建 Android 正式包并发布到 Cloudflare R2（${R2_PUBLIC_BASE_URL}/${ANDROID_PREFIX}），
更新客户端「关于」页检查更新与官网下载读取的 ${ANDROID_MANIFEST_NAME}。
版本号默认取 apps/mobile 当前值，四处版本（package.json、tauri.conf.json、Cargo.toml、Cargo.lock）必须一致。
发布前必须准备好 apps/mobile/release-notes/<版本>.md 更新说明，缺失即拒绝发布。
指定 --version 时先回写四处版本再构建；构建或上传失败时版本号不回滚，修复后可用 --skip-build 重试。
发布前核对安装包的应用 ID、版本与签名证书，证书与线上版本不同即拒绝（已安装用户无法覆盖升级）；
并用 dexdump 确认 proguard-jni.pro 登记的 JNI 方法都还在，缺失即拒绝（被 R8 删掉会启动闪退）。
上传全部成功后自动创建 mobile-vX.Y.Z 版本 tag（已存在则跳过，不自动推送）。iOS 不经此脚本分发。

选项:
  --version x.y.z  指定发布版本并回写四处版本号
  --skip-build     跳过构建，使用现有 release APK
  --dry-run        只执行本地流程（构建、核对、生成清单），不上传
  --force          线上已是同版本时仍强制覆盖（不放行换证书）
  -h, --help       显示帮助

环境变量:
  R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY  上传凭据
  JAVA_HOME / ANDROID_HOME / NDK_HOME                       未设置时按本机默认位置查找
  TAURI_ANDROID_*                                           签名配置，规则见 prepare-android-signing`);
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

function latestSubdir(dir) {
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir).filter(name => /^\d+(\.\d+)*$/.test(name));
  return names.length > 0 ? join(dir, names.sort(compareVersions).at(-1)) : null;
}

// 与 scripts/android-release-install.sh 一致：尊重已有环境变量，缺省时回退到本机默认安装位置
function resolveAndroidEnv() {
  const env = { ...process.env };
  if (!env.JAVA_HOME && process.platform === "darwin") {
    const jbr = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
    try {
      env.JAVA_HOME = execFileSync("/usr/libexec/java_home", { encoding: "utf8" }).trim();
    } catch {
      if (existsSync(jbr)) env.JAVA_HOME = jbr;
    }
  }
  if (!env.JAVA_HOME) throw new Error("未找到 JDK，请设置 JAVA_HOME");
  env.ANDROID_HOME ??= join(homedir(), "Library/Android/sdk");
  if (!existsSync(env.ANDROID_HOME)) throw new Error(`Android SDK 不存在: ${env.ANDROID_HOME}`);
  env.NDK_HOME ??= latestSubdir(join(env.ANDROID_HOME, "ndk")) ?? "";
  if (!env.NDK_HOME) throw new Error("未找到 NDK，请设置 NDK_HOME");
  const buildTools = latestSubdir(join(env.ANDROID_HOME, "build-tools"));
  if (!buildTools) throw new Error(`${env.ANDROID_HOME}/build-tools 下没有可用的构建工具`);
  env.PATH = [join(env.JAVA_HOME, "bin"), join(env.ANDROID_HOME, "platform-tools"), env.PATH].join(
    delimiter
  );
  return { env, buildTools };
}

function run(command, args, env) {
  // dexdump 会输出整个 dex 的结构（十几 MB），默认 1 MB 缓冲不够
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env,
    maxBuffer: 512 * 1024 * 1024,
  });
}

function sha256Of(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** 核对安装包身份与完整性：应用 ID、版本号、签名证书与 JNI 方法都来自 APK 本身，而不是构建配置 */
function inspectApk(apk, version, { env, buildTools }) {
  const badging = parseBadging(run(join(buildTools, "aapt2"), ["dump", "badging", apk], env));
  if (badging.packageName !== ANDROID_PACKAGE_NAME) {
    throw new Error(`安装包应用 ID 是 ${badging.packageName}，应为 ${ANDROID_PACKAGE_NAME}`);
  }
  if (badging.versionName !== version) {
    throw new Error(`安装包版本是 ${badging.versionName}，与发布版本 ${version} 不一致`);
  }
  const certSha256 = parseSignerDigest(
    run(join(buildTools, "apksigner"), ["verify", "--print-certs", apk], env)
  );
  if (!existsSync(jniRulesFile)) throw new Error(`没有找到 JNI 保留规则: ${jniRulesFile}`);
  const missing = findMissingJniMethods(
    run(join(buildTools, "dexdump"), [apk], env),
    parseJniKeepRules(readFileSync(jniRulesFile, "utf8"))
  );
  if (missing.length > 0) {
    throw new Error(
      `安装包缺少 Rust 经 JNI 调用的方法（${missing.join("、")}），调用时会闪退；检查 proguard-jni.pro 的保留规则`
    );
  }
  return { versionCode: badging.versionCode, certSha256 };
}

function runGit(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

// 桌面已占用 vX.Y.Z（且历史上有 v0.2.x），移动端用独立前缀避免撞名
function createVersionTag(version) {
  const tagName = `mobile-v${version}`;
  try {
    if (runGit(["tag", "-l", tagName])) {
      console.log(`▶ 版本 tag ${tagName} 已存在，跳过`);
      return;
    }
    if (runGit(["status", "--porcelain", "--", "apps/mobile/package.json"])) {
      console.log(`  注意: 移动端版本号改动尚未提交，tag 将打在当前 HEAD 上`);
    }
    runGit(["tag", "-a", tagName, "-m", tagName]);
    console.log(`▶ 已创建版本 tag ${tagName}，需要同步远端时请手动 git push origin ${tagName}`);
  } catch (error) {
    console.warn(`⚠ 打版本 tag 失败（不影响发布结果）: ${error?.message ?? error}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dryRun) {
    for (const key of R2_ENV_KEYS) requiredEnv(key);
  }

  const currentVersion = assertVersionsAligned(readMobileVersions(mobileDir));
  const version = options.version ?? currentVersion;
  console.log(`▶ 发布 Android 版本: ${version}`);
  assertReleaseNote(releaseNotesDir, version);

  const android = resolveAndroidEnv();
  if (options.version && options.version !== currentVersion && !options.dryRun) {
    console.log(`▶ 回写移动端版本号 ${currentVersion} → ${version} ...`);
    writeMobileVersion(mobileDir, version);
  }

  if (!options.skipBuild) {
    console.log(`▶ 构建 Android 正式包 ...`);
    const buildArgs = ["--filter", "mobile", "build:android:release"];
    // pnpm run 把自身入口给到 npm_execpath，用当前 node 直接执行，不依赖 PATH 查找 pnpm（Windows 下常失效）
    if (process.env.npm_execpath) {
      execFileSync(process.execPath, [process.env.npm_execpath, ...buildArgs], {
        cwd: root,
        stdio: "inherit",
        env: android.env,
      });
    } else {
      execFileSync("pnpm", buildArgs, {
        cwd: root,
        stdio: "inherit",
        env: android.env,
        shell: process.platform === "win32",
      });
    }
  } else {
    console.log(`▶ --skip-build: 跳过构建，使用现有 APK`);
  }
  if (!existsSync(builtApk)) throw new Error(`没有找到构建产物: ${builtApk}`);

  const { versionCode, certSha256 } = inspectApk(builtApk, version, android);
  const fileName = androidApkName(version);
  mkdirSync(outputDir, { recursive: true });
  const apk = join(outputDir, fileName);
  copyFileSync(builtApk, apk);
  const manifest = buildAndroidManifest({
    version,
    size: statSync(apk).size,
    sha256: sha256Of(apk),
    certSha256,
    releaseNotes: releaseNotesUpTo(releaseNotesDir, version),
    now: new Date(),
  });
  writeFileSync(join(outputDir, ANDROID_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `▶ 安装包 ${fileName}（versionCode ${versionCode}，${(manifest.size / 1024 / 1024).toFixed(2)} MB）`
  );
  console.log(`  SHA-256 ${manifest.sha256}`);
  console.log(`  签名证书 SHA-256 ${certSha256}`);

  if (options.dryRun) {
    console.log(`▶ --dry-run: 本地流程全部通过，产物在 ${outputDir}，跳过上传`);
    return;
  }

  const client = createR2Client();
  const manifestKey = `${ANDROID_PREFIX}/${ANDROID_MANIFEST_NAME}`;
  const remoteText = await client.getText(manifestKey);
  assertPublishable(remoteText ? JSON.parse(remoteText) : null, manifest, options);

  // 先传安装包再写清单，保证清单指向的文件一定已存在
  console.log(`▶ 上传 ${ANDROID_PREFIX}/${fileName} ...`);
  await client.putFile(`${ANDROID_PREFIX}/${fileName}`, apk, "public, max-age=31536000, immutable");
  console.log(`▶ 上传 ${manifestKey} ...`);
  await client.putText(manifestKey, JSON.stringify(manifest), "no-cache");

  createVersionTag(version);
  console.log(`✔ 发布完成`);
  console.log(`  下载地址: ${R2_PUBLIC_BASE_URL}/${ANDROID_PREFIX}/${fileName}`);
  console.log(`  版本信息: ${R2_PUBLIC_BASE_URL}/${manifestKey}`);
}

main().catch(error => {
  console.error(`✖ 发布失败: ${error?.message ?? error}`);
  process.exitCode = 1;
});
