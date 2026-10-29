import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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

const CERT = "a".repeat(64);

function withMobileDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "tau-mobile-release-"));
  mkdirSync(join(dir, "src-tauri"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "mobile", version: "0.2.4" }));
  writeFileSync(join(dir, "src-tauri/tauri.conf.json"), JSON.stringify({ version: "0.2.4" }));
  writeFileSync(
    join(dir, "src-tauri/Cargo.toml"),
    '[package]\nname = "Tau"\nversion = "0.2.4"\n\n[dependencies]\nserde = { version = "1" }\n'
  );
  // Windows autocrlf 检出后 Cargo.lock 为 CRLF，fixture 用同款换行覆盖该场景
  writeFileSync(
    join(dir, "src-tauri/Cargo.lock"),
    '[[package]]\nname = "Serde"\nversion = "1.0.0"\n\n[[package]]\r\nname = "Tau"\r\nversion = "0.2.4"\r\ndependencies = ["serde"]\r\n'
  );
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("回写版本号覆盖四处且不改依赖版本", () => {
  withMobileDir(dir => {
    writeMobileVersion(dir, "0.3.0");
    const versions = readMobileVersions(dir);
    assert.equal(assertVersionsAligned(versions), "0.3.0");
    assert.match(
      readFileSync(join(dir, "src-tauri/Cargo.toml"), "utf8"),
      /serde = \{ version = "1" \}/
    );
    assert.match(
      readFileSync(join(dir, "src-tauri/Cargo.lock"), "utf8"),
      /"Serde"\nversion = "1\.0\.0"/
    );
    // Tau 条目的 CRLF 换行在回写后原样保留
    assert.match(
      readFileSync(join(dir, "src-tauri/Cargo.lock"), "utf8"),
      /version = "0\.3\.0"\r\ndependencies = /
    );
  });
});

test("版本号不一致时拒绝发布", () => {
  assert.throws(
    () => assertVersionsAligned({ packageJson: "0.2.4", tauriConf: "0.2.5" }),
    /版本号不一致/
  );
});

test("解析 aapt2 与 apksigner 输出", () => {
  const badging =
    "package: name='com.txiong.tau_mobile' versionCode='2004' versionName='0.2.4' platformBuildVersionName='15'\nsdkVersion:'24'";
  assert.deepEqual(parseBadging(badging), {
    packageName: "com.txiong.tau_mobile",
    versionCode: "2004",
    versionName: "0.2.4",
  });
  const signer = `Signer #1 certificate DN: CN=Tau\nSigner #1 certificate SHA-256 digest: ${"AB".repeat(32)}\n`;
  assert.equal(parseSignerDigest(signer), "ab".repeat(32));
  assert.throws(() => parseSignerDigest("Verifies"), /SHA-256/);
});

test("清单字段与安装包命名一致", () => {
  const manifest = buildAndroidManifest({
    version: "0.2.5",
    size: 10,
    sha256: "b".repeat(64),
    certSha256: CERT,
    releaseNotes: [{ version: "0.2.5", note: "- 修复" }],
    now: new Date("2026-10-24T00:00:00Z"),
  });
  assert.equal(manifest.file, "Tau-v0.2.5-android-arm64.apk");
  assert.equal(manifest.releaseDate, "2026-10-24T00:00:00.000Z");
});

test("与线上清单对账：同版本、降级与换证书", () => {
  const remote = { version: "0.2.5", certSha256: CERT };
  assert.doesNotThrow(() => assertPublishable(null, { version: "0.2.5", certSha256: CERT }, {}));
  assert.doesNotThrow(() => assertPublishable(remote, { version: "0.2.6", certSha256: CERT }, {}));
  assert.throws(
    () => assertPublishable(remote, { version: "0.2.5", certSha256: CERT }, {}),
    /--force/
  );
  assert.doesNotThrow(() =>
    assertPublishable(remote, { version: "0.2.5", certSha256: CERT }, { force: true })
  );
  assert.throws(
    () => assertPublishable(remote, { version: "0.2.4", certSha256: CERT }, {}),
    /降级/
  );
  assert.throws(
    () =>
      assertPublishable(remote, { version: "0.2.6", certSha256: "c".repeat(64) }, { force: true }),
    /签名证书/
  );
});

const JNI_RULES = `# Rust 经 JNI 调用
-keepclassmembers class com.txiong.tau_mobile.MainActivity {
  public java.lang.String takeIncomingFile();
  public int installAppUpdate(java.lang.String);
}
`;

function dexdump(classes) {
  return Object.entries(classes)
    .map(
      ([descriptor, names], index) =>
        `Class #${index}            -\n  Class descriptor  : '${descriptor}'\n` +
        names
          .map(
            name => `    #0              : (in ${descriptor})\n      name          : '${name}'\n`
          )
          .join("")
    )
    .join("");
}

test("解析 proguard-jni.pro 登记的方法，忽略注释", () => {
  assert.deepEqual(parseJniKeepRules(JNI_RULES), [
    {
      className: "com.txiong.tau_mobile.MainActivity",
      methods: ["takeIncomingFile", "installAppUpdate"],
    },
  ]);
  assert.throws(() => parseJniKeepRules("# 空文件\n"), /没有登记/);
});

test("JNI 方法被 R8 删掉时列出缺失项", () => {
  const rules = parseJniKeepRules(JNI_RULES);
  const intact = dexdump({
    "LA/a;": ["takeIncomingFile"],
    "Lcom/txiong/tau_mobile/MainActivity;": ["onCreate", "installAppUpdate", "takeIncomingFile"],
  });
  assert.deepEqual(findMissingJniMethods(intact, rules), []);
  // 同名方法出现在别的（混淆后的）类里也不算
  const stripped = dexdump({
    "LA/a;": ["takeIncomingFile"],
    "Lcom/txiong/tau_mobile/MainActivity;": ["onCreate", "installAppUpdate"],
  });
  assert.deepEqual(findMissingJniMethods(stripped, rules), [
    "com.txiong.tau_mobile.MainActivity.takeIncomingFile",
  ]);
  assert.equal(findMissingJniMethods("", rules).length, 2);
});
