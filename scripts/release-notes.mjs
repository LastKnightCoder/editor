import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 文件名即版本号；README.md 等非版本文件不参与
const NOTE_FILE_RE = /^(\d+\.\d+\.\d+)\.md$/;
const RELEASE_NOTES_LINE_RE = /^releaseNotes:.*(?:\r?\n|$)/m;

export function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/** 读取全部版本公告，按版本从新到旧排列 */
export function listReleaseNotes(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map(name => NOTE_FILE_RE.exec(name))
    .filter(Boolean)
    .map(([name, version]) => ({ version, note: readFileSync(join(dir, name), "utf8").trim() }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** 发布前卡口：当前版本必须有非空公告 */
export function assertReleaseNote(dir, version) {
  const file = join(dir, `${version}.md`);
  const display = relative(repoRoot, file);
  if (!existsSync(file)) {
    throw new Error(`缺少 v${version} 的升级公告，请先编写 ${display}（格式见同目录 README.md）`);
  }
  if (!readFileSync(file, "utf8").trim()) {
    throw new Error(`v${version} 的升级公告为空：${display}`);
  }
}

/**
 * 把公告写进 latest*.yml 的 releaseNotes 字段，electron-updater 检查更新时原样读到 updateInfo.releaseNotes。
 * 单行 JSON 即合法 YAML 流式序列；重复执行先替换旧行，保证 --skip-build 重试幂等。
 */
export function injectReleaseNotes(ymlContent, notes) {
  const line = `releaseNotes: ${JSON.stringify(notes)}\n`;
  if (RELEASE_NOTES_LINE_RE.test(ymlContent)) {
    return ymlContent.replace(RELEASE_NOTES_LINE_RE, line);
  }
  return `${ymlContent.replace(/\s*$/, "")}\n${line}`;
}

/** 截至发布版本（含）的全部公告，客户端按自身版本截取跨越的区间 */
export function releaseNotesUpTo(dir, version) {
  return listReleaseNotes(dir).filter(item => compareVersions(item.version, version) <= 0);
}
