import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
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

require(codexHasSigning) {
    "Android 签名资料缺失，请恢复现有密钥并运行 pnpm prepare:android:signing。"
}
android {
    signingConfigs {
        val releaseConfig = findByName("release") ?: create("release")
        releaseConfig.storeFile = codexStoreFile
        releaseConfig.storePassword = codexStorePassword
        releaseConfig.keyAlias = codexKeyAlias
        releaseConfig.keyPassword = codexKeyPassword
    }
    buildTypes {
        // 同一应用 ID 的调试包沿用正式身份，以支持保留数据的覆盖安装。
        getByName("debug") {
            signingConfig = signingConfigs.getByName("release")
        }
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
// ${SIGNING_MARK_END}
`;

function pickWorkingKeytool(env) {
  const candidates = ["keytool"];
  if (env.JAVA_HOME) {
    candidates.push(
      path.join(env.JAVA_HOME, "bin", process.platform === "win32" ? "keytool.exe" : "keytool")
    );
  }
  if (process.platform === "win32") {
    const programFiles = env.ProgramFiles ?? "C:\\Program Files";
    candidates.push(
      path.join(programFiles, "Android", "Android Studio", "jbr", "bin", "keytool.exe"),
      path.join(programFiles, "Android", "Android Studio", "jre", "bin", "keytool.exe")
    );
  }
  if (process.platform === "darwin") {
    candidates.push("/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool");
  }
  return (
    candidates.find(
      candidate =>
        spawnSync(candidate, ["-help"], { env, stdio: "ignore", windowsHide: true }).status === 0
    ) ?? ""
  );
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map(line => /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line))
      .filter(Boolean)
      .map(match => [match[1], match[2]])
  );
}

function readProperties(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const escapes = { t: "\t", n: "\n", r: "\r", f: "\f" };
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map(line => /^\s*([^#!\s:=]+)\s*[=:]\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map(match => [
        match[1],
        match[2].replace(/\\u([a-fA-F0-9]{4})|\\(.)/g, (_, unicode, character) =>
          unicode ? String.fromCharCode(parseInt(unicode, 16)) : (escapes[character] ?? character)
        ),
      ])
  );
}

function escapeProperty(value) {
  return value.replace(/[\\\t\n\r\f]|[^\x20-\x7e]|^ /g, character => {
    const escapes = {
      "\\": "\\\\",
      "\t": "\\t",
      "\n": "\\n",
      "\r": "\\r",
      "\f": "\\f",
      " ": "\\ ",
    };
    return escapes[character] ?? "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0");
  });
}

function firstNonEmpty(...values) {
  return values.find(value => value !== undefined && value !== "") ?? "";
}

export function prepareAndroidSigning({
  mobileDir = path.resolve(path.dirname(scriptPath), ".."),
  env = process.env,
  keytoolBin,
} = {}) {
  const androidAppDir = path.join(mobileDir, "src-tauri", "gen", "android", "app");
  const androidAppGradle = path.join(androidAppDir, "build.gradle.kts");
  if (!fs.existsSync(androidAppGradle)) {
    throw new Error("Android 工程未初始化，请先运行 pnpm exec tauri android init。");
  }

  const signingDir = path.resolve(
    env.TAURI_ANDROID_SIGNING_DIR || path.join(os.homedir(), ".editor-mobile-signing")
  );
  const credentials = parseEnvFile(path.join(signingDir, "credentials.env"));
  const propertiesPath = path.join(androidAppDir, "keystore.properties");
  const existing = readProperties(propertiesPath);
  const keystorePath = path.resolve(
    androidAppDir,
    firstNonEmpty(
      env.TAURI_ANDROID_KEYSTORE_PATH,
      credentials.KEYSTORE_PATH,
      existing.storeFile,
      path.join(signingDir, "editor-mobile-release.jks")
    )
  );
  const keyAlias = firstNonEmpty(
    env.TAURI_ANDROID_KEY_ALIAS,
    credentials.KEY_ALIAS,
    existing.keyAlias
  );
  const storePassword = firstNonEmpty(
    env.TAURI_ANDROID_KEYSTORE_PASSWORD,
    credentials.STORE_PASSWORD,
    existing.storePassword
  );
  const keyPassword = firstNonEmpty(
    env.TAURI_ANDROID_KEY_PASSWORD,
    credentials.KEY_PASSWORD,
    existing.keyPassword
  );

  if (!fs.existsSync(keystorePath)) {
    throw new Error("Android 签名密钥不存在，请恢复原密钥；不会自动生成、导入或替换密钥。");
  }
  if (!keyAlias || !storePassword || !keyPassword) {
    throw new Error("Android 签名配置不完整，请提供原密钥别名、密钥库密码和私钥密码。");
  }
  const keytool = keytoolBin ?? pickWorkingKeytool(env);
  if (!keytool) {
    throw new Error("未找到可用 keytool，无法验证签名；请配置 JDK 或 Android Studio。");
  }

  // 密码通过子进程环境传递，不放进命令参数或输出；所有校验均不写密钥库。
  const validationEnv = {
    ...env,
    TAU_SIGNING_STORE_PASSWORD: storePassword,
    TAU_SIGNING_KEY_PASSWORD: keyPassword,
  };
  const commonArgs = [
    "-keystore",
    keystorePath,
    "-storepass:env",
    "TAU_SIGNING_STORE_PASSWORD",
    "-J-Duser.language=en",
    "-J-Duser.country=US",
  ];
  const listed = spawnSync(keytool, ["-list", ...commonArgs], {
    env: validationEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (listed.status !== 0) {
    throw new Error("无法验证 Android 密钥库：请检查原文件、密码和 JDK；现有资料未修改。");
  }
  // keytool 会忽略 PKCS12 中不同的私钥密码，必须显式拒绝，不能静默改写用户配置。
  if (/^Keystore type:\s*PKCS12\s*$/im.test(listed.stdout) && keyPassword !== storePassword) {
    throw new Error("PKCS12 签名要求私钥密码与密钥库密码一致；请核对原配置，资料未修改。");
  }
  const requested = spawnSync(
    keytool,
    ["-certreq", ...commonArgs, "-alias", keyAlias, "-keypass:env", "TAU_SIGNING_KEY_PASSWORD"],
    { env: validationEnv, stdio: "ignore", windowsHide: true }
  );
  if (requested.status !== 0) {
    throw new Error("无法使用 Android 签名私钥：请检查别名和私钥密码；现有资料未修改。");
  }

  const rawGradle = fs.readFileSync(androidAppGradle, "utf8");
  const blockPattern = new RegExp(
    "\n?// " + SIGNING_MARK_START + "[\\s\\S]*?// " + SIGNING_MARK_END + "\n?",
    "g"
  );
  const properties = {
    storeFile: keystorePath.replace(/\\/g, "/"),
    storePassword,
    keyAlias,
    keyPassword,
  };
  fs.writeFileSync(
    propertiesPath,
    Object.entries(properties)
      .map(([key, value]) => key + "=" + escapeProperty(value))
      .join("\n") + "\n",
    { mode: 0o600 }
  );
  if (process.platform !== "win32") fs.chmodSync(propertiesPath, 0o600);
  fs.writeFileSync(androidAppGradle, rawGradle.replace(blockPattern, "") + SIGNING_BLOCK);
  console.log("Android 现有签名资料验证通过，已更新工程签名配置；原密钥与凭据文件未修改。");
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(scriptPath)) {
  try {
    prepareAndroidSigning();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
