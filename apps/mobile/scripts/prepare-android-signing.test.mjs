import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareAndroidSigning } from "./prepare-android-signing.mjs";

const scriptPath = fileURLToPath(new URL("./prepare-android-signing.mjs", import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tau-signing-test-"));
const storePassword = "fixture-store-password";
const jksKeyPassword = "fixture\\key:=!password";
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("TAURI_ANDROID_"))
);
const candidates = [
  process.env.JAVA_HOME &&
    path.join(
      process.env.JAVA_HOME,
      "bin",
      process.platform === "win32" ? "keytool.exe" : "keytool"
    ),
  "keytool",
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool",
  path.join(
    process.env.ProgramFiles ?? "C:\\Program Files",
    "Android",
    "Android Studio",
    "jbr",
    "bin",
    "keytool.exe"
  ),
].filter(Boolean);
const keytoolBin = candidates.find(
  candidate => spawnSync(candidate, ["-help"], { stdio: "ignore", windowsHide: true }).status === 0
);

function keytool(args) {
  const result = spawnSync(keytoolBin, args, {
    env: {
      ...cleanEnv,
      FIXTURE_STORE_PASSWORD: storePassword,
      FIXTURE_KEY_PASSWORD: jksKeyPassword,
    },
    stdio: "pipe",
    windowsHide: true,
  });
  assert.equal(result.status, 0, "临时测试密钥命令应成功");
  return result.stdout;
}

before(() => {
  assert.ok(keytoolBin, "签名测试需要 JDK keytool，请配置 JAVA_HOME");
  for (const type of ["PKCS12", "JKS"]) {
    keytool([
      "-genkeypair",
      "-storetype",
      type,
      "-keystore",
      path.join(temporary, type + ".jks"),
      "-alias",
      "fixture",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "1",
      "-dname",
      "CN=Tau Signing Test",
      "-storepass:env",
      "FIXTURE_STORE_PASSWORD",
      "-keypass:env",
      type === "JKS" ? "FIXTURE_KEY_PASSWORD" : "FIXTURE_STORE_PASSWORD",
    ]);
  }
});
after(() => fs.rmSync(temporary, { recursive: true, force: true }));

function fixture(
  context,
  { type = "PKCS12", project = true, credentials = true, key = true } = {}
) {
  const mobileDir = fs.mkdtempSync(path.join(temporary, "mobile-"));
  context.after(() => fs.rmSync(mobileDir, { recursive: true, force: true }));
  const appDir = path.join(mobileDir, "src-tauri/gen/android/app");
  const signingDir = path.join(mobileDir, "私有签名");
  fs.mkdirSync(signingDir);
  const keyPath = path.join(signingDir, "editor-mobile-release.jks");
  if (key) fs.copyFileSync(path.join(temporary, type + ".jks"), keyPath);
  const credentialsPath = path.join(signingDir, "credentials.env");
  if (credentials) {
    fs.writeFileSync(
      credentialsPath,
      "KEYSTORE_PATH=" +
        keyPath +
        "\nKEY_ALIAS=fixture\nSTORE_PASSWORD=" +
        storePassword +
        "\nKEY_PASSWORD=" +
        (type === "JKS" ? jksKeyPassword : storePassword) +
        "\n"
    );
  }
  if (project) {
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "build.gradle.kts"),
      "import java.util.Properties\nandroid {}\n"
    );
    fs.writeFileSync(path.join(appDir, "keystore.properties"), "# 原工程配置\n");
  }
  const options = {
    mobileDir,
    keytoolBin,
    env: { ...cleanEnv, TAURI_ANDROID_SIGNING_DIR: signingDir },
  };
  return { options, mobileDir, appDir, signingDir, keyPath, credentialsPath };
}

function snapshot(directory) {
  const files = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    files[entry.name] = entry.isDirectory() ? snapshot(filename) : fs.readFileSync(filename);
  }
  return files;
}

function rejectsWithoutChanges(f, pattern) {
  const original = snapshot(f.mobileDir);
  assert.throws(() => prepareAndroidSigning(f.options), pattern);
  assert.deepEqual(
    snapshot(f.mobileDir),
    original,
    "失败不得生成、替换、重命名或修改任何签名/工程文件"
  );
}

function runCli(f) {
  const scripts = path.join(f.mobileDir, "scripts");
  fs.mkdirSync(scripts);
  fs.copyFileSync(scriptPath, path.join(scripts, "prepare-android-signing.mjs"));
  return spawnSync(process.execPath, [path.join(scripts, "prepare-android-signing.mjs")], {
    env: f.options.env,
    encoding: "utf8",
    windowsHide: true,
  });
}

test("工程未初始化时停止，不生成密钥或写配置", context => {
  rejectsWithoutChanges(fixture(context, { project: false }), /工程未初始化/);
});

test("密钥缺失时停止，不生成或替换文件", context => {
  const f = fixture(context, { key: false });
  rejectsWithoutChanges(f, /密钥不存在/);
});

test("私有签名目录不存在时停止，不创建目录", context => {
  const f = fixture(context);
  f.options.env.TAURI_ANDROID_SIGNING_DIR = path.join(f.mobileDir, "不存在");
  rejectsWithoutChanges(f, /密钥不存在/);
});

test("缺少密码或别名时停止，不随机生成或猜测配置", context => {
  const f = fixture(context, { credentials: false });
  rejectsWithoutChanges(f, /配置不完整/);
});

test("错误密钥库密码优先于文件配置并导致失败，CLI 不泄漏密码", context => {
  const f = fixture(context);
  const wrongPassword = "wrong-private-fixture-password";
  f.options.env.TAURI_ANDROID_KEYSTORE_PASSWORD = wrongPassword;
  rejectsWithoutChanges(f, /无法验证.*密钥库/);
  const result = runCli(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /无法验证.*密钥库/);
  for (const password of [wrongPassword, storePassword]) {
    assert.ok(!(result.stdout + result.stderr).includes(password));
  }
});

test("密钥库损坏时停止，保留原文件供恢复", context => {
  const f = fixture(context);
  fs.writeFileSync(f.keyPath, "broken-keystore");
  rejectsWithoutChanges(f, /无法验证.*密钥库/);
});

test("别名错误时停止，不选择其他密钥", context => {
  const f = fixture(context);
  f.options.env.TAURI_ANDROID_KEY_ALIAS = "missing-alias";
  rejectsWithoutChanges(f, /检查别名和私钥密码/);
});

test("JKS 私钥密码错误时停止，不覆盖成密钥库密码", context => {
  const f = fixture(context, { type: "JKS" });
  f.options.env.TAURI_ANDROID_KEY_PASSWORD = storePassword;
  rejectsWithoutChanges(f, /检查别名和私钥密码/);
});

test("PKCS12 不同私钥密码必须失败，不能被 keytool 静默忽略", context => {
  const f = fixture(context);
  f.options.env.TAURI_ANDROID_KEY_PASSWORD = "wrong-key-password";
  rejectsWithoutChanges(f, /PKCS12/);
});

test("缺少或无法执行 keytool 时停止，不信任已有工程配置", context => {
  for (const keytool of ["", path.join(temporary, "missing-keytool")]) {
    const f = fixture(context);
    f.options.keytoolBin = keytool;
    rejectsWithoutChanges(f, /keytool|无法验证/);
  }
});

test("只有公开证书的别名不能作为签名私钥", context => {
  const f = fixture(context, { type: "JKS" });
  const certificate = path.join(f.mobileDir, "public.cer");
  fs.writeFileSync(
    certificate,
    keytool([
      "-exportcert",
      "-keystore",
      f.keyPath,
      "-alias",
      "fixture",
      "-storepass:env",
      "FIXTURE_STORE_PASSWORD",
    ])
  );
  keytool([
    "-importcert",
    "-noprompt",
    "-keystore",
    f.keyPath,
    "-alias",
    "certificate-only",
    "-file",
    certificate,
    "-storepass:env",
    "FIXTURE_STORE_PASSWORD",
  ]);
  f.options.env.TAURI_ANDROID_KEY_ALIAS = "certificate-only";
  rejectsWithoutChanges(f, /检查别名和私钥密码/);
});

for (const type of ["PKCS12", "JKS"]) {
  test(type + " 成功与重复执行保持密钥、凭据和单一 Gradle 配置不变", context => {
    const f = fixture(context, { type });
    const privateFiles = snapshot(f.signingDir);
    prepareAndroidSigning(f.options);
    const generated = snapshot(f.appDir);
    prepareAndroidSigning(f.options);
    assert.deepEqual(snapshot(f.signingDir), privateFiles);
    assert.deepEqual(snapshot(f.appDir), generated);
    const gradle = fs.readFileSync(path.join(f.appDir, "build.gradle.kts"), "utf8");
    assert.equal(gradle.split("// codex-auto-signing-start").length - 1, 1);
    assert.match(gradle, /require\(codexHasSigning\)/);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(path.join(f.appDir, "keystore.properties")).mode & 0o777, 0o600);
    }
    // 只保留生成的 Java properties，验证非 ASCII 路径与密码转义可以恢复原签名。
    fs.unlinkSync(f.credentialsPath);
    prepareAndroidSigning(f.options);
    assert.deepEqual(snapshot(f.appDir), generated);
    assert.equal(fs.existsSync(f.credentialsPath), false);
  });
}

test("显式环境配置可使用已有密钥，不创建或回写 credentials.env", context => {
  const f = fixture(context, { credentials: false });
  Object.assign(f.options.env, {
    TAURI_ANDROID_KEYSTORE_PATH: f.keyPath,
    TAURI_ANDROID_KEYSTORE_PASSWORD: storePassword,
    TAURI_ANDROID_KEY_ALIAS: "fixture",
    TAURI_ANDROID_KEY_PASSWORD: storePassword,
  });
  const privateFiles = snapshot(f.signingDir);
  const result = runCli(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /现有签名资料验证通过/);
  assert.match(
    fs.readFileSync(path.join(f.appDir, "build.gradle.kts"), "utf8"),
    /require\(codexHasSigning\)/
  );
  assert.deepEqual(snapshot(f.signingDir), privateFiles);
  assert.ok(!(result.stdout + result.stderr).includes(storePassword));
});
