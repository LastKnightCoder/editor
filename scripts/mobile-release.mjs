import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareVersions } from "./release-notes.mjs";

/** R2 上 Android 发布目录；客户端检查更新与官网下载都读这里的 latest.json */
export const ANDROID_PREFIX = "mobile/android";
export const ANDROID_MANIFEST_NAME = "latest.json";
export const ANDROID_PACKAGE_NAME = "com.txiong.tau_mobile";

export function androidApkName(version) {
  return `Tau-v${version}-android-arm64.apk`;
}

const VERSION_FILES = {
  packageJson: "package.json",
  tauriConf: "src-tauri/tauri.conf.json",
  cargoToml: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
};

// Cargo.lock 中移动包自身的条目；依赖里没有同名包。Windows autocrlf 检出为 CRLF，两种换行都要匹配
const CARGO_LOCK_RE = /(\[\[package\]\]\r?\nname = "Tau"\r?\nversion = ")([^"]+)(")/;
// Cargo.toml 的 [package] 段位于文件开头，第一处 version 即包版本
const CARGO_TOML_RE = /^(version = ")([^"]+)(")/m;

/** 读取移动端四处版本号；任意一处缺失即视为配置损坏 */
export function readMobileVersions(mobileDir) {
  const read = name => readFileSync(join(mobileDir, VERSION_FILES[name]), "utf8");
  const versions = {
    packageJson: JSON.parse(read("packageJson")).version,
    tauriConf: JSON.parse(read("tauriConf")).version,
    cargoToml: CARGO_TOML_RE.exec(read("cargoToml"))?.[2],
    cargoLock: CARGO_LOCK_RE.exec(read("cargoLock"))?.[2],
  };
  for (const [name, version] of Object.entries(versions)) {
    if (!version) throw new Error(`${VERSION_FILES[name]} 中没有找到移动端版本号`);
  }
  return versions;
}

export function assertVersionsAligned(versions) {
  const distinct = new Set(Object.values(versions));
  if (distinct.size !== 1) {
    const detail = Object.entries(versions)
      .map(([name, version]) => `${VERSION_FILES[name]}=${version}`)
      .join("，");
    throw new Error(`移动端版本号不一致：${detail}`);
  }
  return Object.values(versions)[0];
}

export function writeMobileVersion(mobileDir, version) {
  const update = (name, transform) => {
    const file = join(mobileDir, VERSION_FILES[name]);
    writeFileSync(file, transform(readFileSync(file, "utf8")));
  };
  const setJsonVersion = text => {
    const data = JSON.parse(text);
    data.version = version;
    return `${JSON.stringify(data, null, 2)}\n`;
  };
  update("packageJson", setJsonVersion);
  update("tauriConf", setJsonVersion);
  update("cargoToml", text => text.replace(CARGO_TOML_RE, `$1${version}$3`));
  update("cargoLock", text => text.replace(CARGO_LOCK_RE, `$1${version}$3`));
}

/** aapt2 dump badging 首行：package: name='…' versionCode='…' versionName='…' */
export function parseBadging(output) {
  const line = output.split("\n").find(item => item.startsWith("package:")) ?? "";
  const field = key => new RegExp(`${key}='([^']*)'`).exec(line)?.[1] ?? null;
  return {
    packageName: field("name"),
    versionCode: field("versionCode"),
    versionName: field("versionName"),
  };
}

/** apksigner verify --print-certs 输出里首个签名者的证书 SHA-256 */
export function parseSignerDigest(output) {
  const digest =
    /(?:Signer #1 certificate|V\d+ Signer: certificate) SHA-256 digest:\s*([0-9a-f]{64})/i.exec(
      output
    )?.[1];
  if (!digest) throw new Error("apksigner 输出中没有找到签名证书 SHA-256");
  return digest.toLowerCase();
}

/**
 * 读取 proguard-jni.pro 的保留规则：每个 `-keepclassmembers class X { ... }` 块里带括号的成员即 Rust 经 JNI 调用的方法。
 * 一条都没登记时视为文件损坏，避免检查静默放行。
 */
export function parseJniKeepRules(text) {
  const blockRe = /-keep(?:classmembers)?\s+class\s+([\w.$]+)\s*\{([^}]*)\}/g;
  const rules = [];
  for (const [, className, body] of text.replace(/#.*$/gm, "").matchAll(blockRe)) {
    const methods = [...body.matchAll(/([\w$]+)\s*\(/g)].map(match => match[1]);
    if (methods.length > 0) rules.push({ className, methods });
  }
  if (rules.length === 0) throw new Error("proguard-jni.pro 中没有登记任何 JNI 方法");
  return rules;
}

/** 对照 dexdump 输出，列出被 R8 删掉或改名的 JNI 方法（形如 com.x.MainActivity.takeIncomingFile） */
export function findMissingJniMethods(dexdumpOutput, rules) {
  const members = new Map();
  for (const block of dexdumpOutput.split(/^Class #\d+/m)) {
    const descriptor = /Class descriptor\s*:\s*'L([^;]+);'/.exec(block)?.[1];
    if (!descriptor) continue;
    const names = [...block.matchAll(/^\s+name\s*:\s*'([^']+)'/gm)].map(match => match[1]);
    members.set(descriptor.replaceAll("/", "."), new Set(names));
  }
  return rules.flatMap(({ className, methods }) =>
    methods
      .filter(method => !members.get(className)?.has(method))
      .map(method => `${className}.${method}`)
  );
}

export function buildAndroidManifest({ version, size, sha256, certSha256, releaseNotes, now }) {
  return {
    version,
    releaseDate: now.toISOString(),
    file: androidApkName(version),
    size,
    sha256,
    certSha256,
    releaseNotes,
  };
}

/**
 * 发布前与线上 latest.json 对账：同版本需 --force 覆盖、不允许降级；
 * 签名证书一旦变化，已安装用户无法覆盖升级，--force 也不放行。
 */
export function assertPublishable(remote, local, { force }) {
  if (!remote) return;
  if (remote.certSha256 && remote.certSha256 !== local.certSha256) {
    throw new Error(
      `签名证书与线上版本不一致（线上 ${remote.certSha256}，本次 ${local.certSha256}），已安装用户将无法覆盖升级`
    );
  }
  if (force) return;
  const diff = compareVersions(local.version, remote.version);
  if (diff === 0) {
    throw new Error(`线上已是 ${local.version}，客户端不会重复提示；请升版本或使用 --force 覆盖`);
  }
  if (diff < 0) {
    throw new Error(`线上版本 ${remote.version} 高于本次 ${local.version}，不允许降级发布`);
  }
}
