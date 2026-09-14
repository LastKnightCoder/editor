// 跨平台替代 prepare-android-signing.sh：Windows 下 pnpm postinstall 会把 `bash`
// 解析到 WSL 存根（未装发行版即失败），因此签名准备统一用 Node 实现。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidAppDir = path.join(mobileDir, "src-tauri", "gen", "android", "app");
const androidAppGradle = path.join(androidAppDir, "build.gradle.kts");

const SIGNING_MARK_START = "codex-auto-signing-start";
const SIGNING_MARK_END = "codex-auto-signing-end";

const SIGNING_BLOCK = `
// ${SIGNING_MARK_START}
val codexKeystoreProperties = Properties().apply {
    val propFile = file("keystore.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}
val codexStoreFilePath = System.getenv("TAURI_ANDROID_KEYSTORE_PATH")
    ?: codexKeystoreProperties.getProperty("storeFile")
val codexStorePassword = System.getenv("TAURI_ANDROID_KEYSTORE_PASSWORD")
    ?: codexKeystoreProperties.getProperty("storePassword")
val codexKeyAlias = System.getenv("TAURI_ANDROID_KEY_ALIAS")
    ?: codexKeystoreProperties.getProperty("keyAlias")
val codexKeyPassword = System.getenv("TAURI_ANDROID_KEY_PASSWORD")
    ?: codexKeystoreProperties.getProperty("keyPassword")
val codexStoreFile = if (!codexStoreFilePath.isNullOrBlank()) file(codexStoreFilePath) else null
val codexHasSigning = codexStoreFile?.exists() == true
    && !codexStorePassword.isNullOrBlank()
    && !codexKeyAlias.isNullOrBlank()
    && !codexKeyPassword.isNullOrBlank()

android {
    signingConfigs {
        if (codexHasSigning) {
            val releaseConfig = findByName("release") ?: create("release")
            releaseConfig.storeFile = codexStoreFile
            releaseConfig.storePassword = codexStorePassword
            releaseConfig.keyAlias = codexKeyAlias
            releaseConfig.keyPassword = codexKeyPassword
        }
    }
    buildTypes {
        getByName("debug") {
            // debug 包也用 release 证书签名：与正式安装包签名一致，
            // dev 构建可直接覆盖安装已装的正式包（避免 INSTALL_FAILED_UPDATE_INCOMPATIBLE）
            if (codexHasSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        getByName("release") {
            if (codexHasSigning) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                project.logger.lifecycle(
                    "Release signing is not configured. Build output may be unsigned."
                )
            }
        }
    }
}
// ${SIGNING_MARK_END}
`;

if (!fs.existsSync(androidAppDir)) {
  // Android 工程尚未生成（未跑过 tauri android init/build），安静跳过；
  // dev:android / build:android:* 已串联本脚本，生成后会自动补上
  console.log("Android 工程不存在，跳过签名准备（首次运行 tauri android dev/build 时自动执行）。");
  process.exit(0);
}

if (!fs.existsSync(androidAppGradle)) {
  console.error(`缺少 Android Gradle 文件: ${androidAppGradle}`);
  process.exit(1);
}

function stripExistingSigningBlock(raw) {
  const blockPattern = new RegExp(
    `\\n?// ${SIGNING_MARK_START}[\\s\\S]*?// ${SIGNING_MARK_END}\\n?`,
    "g"
  );
  return raw.replace(blockPattern, "");
}

function ensureGradleSigningHook() {
  const raw = fs.readFileSync(androidAppGradle, "utf8");
  if (raw.includes(SIGNING_MARK_START)) {
    fs.writeFileSync(androidAppGradle, stripExistingSigningBlock(raw), "utf8");
  }
  fs.appendFileSync(androidAppGradle, SIGNING_BLOCK, "utf8");
  console.log(`已更新 Android release 自动签名配置: ${androidAppGradle}`);
}

function tryKeytool(candidate) {
  if (!candidate) return false;
  return spawnSync(candidate, ["-help"], { stdio: "ignore", windowsHide: true }).status === 0;
}

function pickWorkingKeytool() {
  const candidates = ["keytool"];
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    candidates.push(
      path.join(javaHome, "bin", process.platform === "win32" ? "keytool.exe" : "keytool")
    );
  }
  if (process.platform === "win32") {
    const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
    candidates.push(
      path.join(programFiles, "Android", "Android Studio", "jbr", "bin", "keytool.exe"),
      path.join(programFiles, "Android", "Android Studio", "jre", "bin", "keytool.exe")
    );
  }
  if (process.platform === "darwin") {
    candidates.push("/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool");
  }
  return candidates.find(candidate => tryKeytool(candidate)) ?? "";
}

ensureGradleSigningHook();

const keytoolBin = pickWorkingKeytool();
if (!keytoolBin) {
  if (fs.existsSync(path.join(androidAppDir, "keystore.properties"))) {
    // 无 keytool（如未装 JDK 的环境）：保留现有签名配置，仅注入 gradle hook
    console.log("未找到 keytool，保留现有 keystore 配置并仅注入签名 hook。");
  } else {
    console.log("未找到 keytool 且无现有签名配置，跳过签名准备。请安装 JDK 或 Android Studio。");
    process.exit(0);
  }
}

function generatePassword() {
  return crypto
    .randomBytes(48)
    .toString("base64")
    .replace(/\//g, "A")
    .replace(/\+/g, "B")
    .slice(0, 32);
}

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function readPropertiesValue(raw, key) {
  const match = new RegExp(`^${key}=(.*)$`, "m").exec(raw);
  return match ? match[1].trim() : "";
}

function firstNonEmpty(...values) {
  return values.find(value => value !== undefined && value !== "") ?? "";
}

function formatTimestamp(date) {
  const pad = n => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function chmodQuiet(filePath, mode) {
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Windows 不支持 POSIX 权限位，忽略即可
  }
}

const signingDir =
  process.env.TAURI_ANDROID_SIGNING_DIR || path.join(os.homedir(), ".editor-mobile-signing");
const credentialsFile = path.join(signingDir, "credentials.env");
const keystorePathDefault = path.join(signingDir, "editor-mobile-release.jks");
const keyAliasDefault = process.env.TAURI_ANDROID_KEY_ALIAS || "editor_upload";
const keyDname = process.env.TAURI_ANDROID_KEY_DNAME || "CN=Editor Mobile,O=Editor,C=US";

fs.mkdirSync(signingDir, { recursive: true });
chmodQuiet(signingDir, 0o700);

const credentials = parseEnvFile(credentialsFile);

const keystorePropertiesPath = path.join(androidAppDir, "keystore.properties");
let existingStorePassword = "";
let existingKeyPassword = "";
let existingKeyAlias = "";
if (fs.existsSync(keystorePropertiesPath)) {
  const raw = fs.readFileSync(keystorePropertiesPath, "utf8");
  existingStorePassword = readPropertiesValue(raw, "storePassword");
  existingKeyPassword = readPropertiesValue(raw, "keyPassword");
  existingKeyAlias = readPropertiesValue(raw, "keyAlias");
}

let keystorePath = firstNonEmpty(
  process.env.TAURI_ANDROID_KEYSTORE_PATH,
  credentials.KEYSTORE_PATH,
  keystorePathDefault
);
const keyAlias = firstNonEmpty(
  process.env.TAURI_ANDROID_KEY_ALIAS,
  credentials.KEY_ALIAS,
  existingKeyAlias,
  keyAliasDefault
);
let storePassword = firstNonEmpty(
  process.env.TAURI_ANDROID_KEYSTORE_PASSWORD,
  credentials.STORE_PASSWORD,
  existingStorePassword
);
let keyPassword = firstNonEmpty(
  process.env.TAURI_ANDROID_KEY_PASSWORD,
  credentials.KEY_PASSWORD,
  existingKeyPassword
);

if (storePassword === "your_store_password" || !storePassword) {
  storePassword = generatePassword();
}
if (keyPassword === "your_key_password" || !keyPassword) {
  keyPassword = storePassword;
}

// PKCS12 默认要求 keyPassword 与 storePassword 一致，这里统一处理避免签名失败。
keyPassword = storePassword;

function keystorePasswordOk() {
  if (!fs.existsSync(keystorePath)) return false;
  if (!keytoolBin) {
    // 无 keytool 无法验证：信任现有配置，避免误判密码不符后重建证书造成签名分叉
    return true;
  }
  return (
    spawnSync(keytoolBin, ["-list", "-keystore", keystorePath, "-storepass", storePassword], {
      stdio: "ignore",
      windowsHide: true,
    }).status === 0
  );
}

let needCreateKeystore = false;
if (!fs.existsSync(keystorePath)) {
  needCreateKeystore = true;
} else if (!keystorePasswordOk()) {
  const backupPath = `${keystorePath}.bak.${formatTimestamp(new Date())}`;
  fs.renameSync(keystorePath, backupPath);
  console.log(`检测到 keystore 密码与配置不一致，已备份旧文件到: ${backupPath}`);
  needCreateKeystore = true;
}

if (needCreateKeystore) {
  fs.mkdirSync(path.dirname(keystorePath), { recursive: true });
  const keystoreB64 = process.env.TAURI_ANDROID_KEYSTORE_B64;
  if (keystoreB64) {
    fs.writeFileSync(keystorePath, Buffer.from(keystoreB64.replace(/\s+/g, ""), "base64"));
    console.log(`已从 TAURI_ANDROID_KEYSTORE_B64 导入 keystore: ${keystorePath}`);
  } else {
    spawnSync(
      keytoolBin,
      [
        "-genkeypair",
        "-v",
        "-keystore",
        keystorePath,
        "-storepass",
        storePassword,
        "-alias",
        keyAlias,
        "-keypass",
        keyPassword,
        "-keyalg",
        "RSA",
        "-keysize",
        "4096",
        "-validity",
        "36500",
        "-dname",
        keyDname,
      ],
      { stdio: ["ignore", "ignore", "inherit"], windowsHide: true }
    );
    console.log(`已自动生成 release keystore: ${keystorePath}`);
  }
}

if (fs.existsSync(keystorePath) && (!storePassword || !keyPassword)) {
  console.error("检测到已有 keystore 但缺少密码，无法自动继续。");
  console.error(
    "请设置 TAURI_ANDROID_KEYSTORE_PASSWORD / TAURI_ANDROID_KEY_PASSWORD，或删除旧 keystore 让脚本重建。"
  );
  process.exit(1);
}

fs.writeFileSync(
  credentialsFile,
  `KEYSTORE_PATH=${keystorePath}\nKEY_ALIAS=${keyAlias}\nSTORE_PASSWORD=${storePassword}\nKEY_PASSWORD=${keyPassword}\n`,
  "utf8"
);
chmodQuiet(credentialsFile, 0o600);

// keystore.properties 遵循 Java properties 转义规则，Windows 路径统一写成正斜杠，
// 避免 `\U` 等被 Properties.load 吞掉导致 Gradle 找不到签名文件。
const keystorePathForProperties = keystorePath.replace(/\\/g, "/");
fs.writeFileSync(
  keystorePropertiesPath,
  `storeFile=${keystorePathForProperties}\nstorePassword=${storePassword}\nkeyAlias=${keyAlias}\nkeyPassword=${keyPassword}\n`,
  "utf8"
);
chmodQuiet(keystorePropertiesPath, 0o600);

console.log("Android release 签名准备完成。");
console.log(`keystore.properties: ${keystorePropertiesPath}`);
console.log(`keystore: ${keystorePath}`);
