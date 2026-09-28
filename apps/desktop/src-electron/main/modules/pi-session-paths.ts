/**
 * pi 会话目录的唯一取法（M4）。开库迁移、会话宿主、改历史操作、同步打包都从这里取，
 * 避免两处拼法不一致导致迁移写出的文件宿主找不到。electron-free。
 *
 * - 应用对话：`~/.editor/sessions/<库名>/`，随库走（同步时整目录打包）；
 * - 浏览器扩展对话：`~/.editor/browser-sessions/<页面键>/`，与库无关、不参与同步（用户裁决：
 *   扩展对话与应用对话拆开，跟着页面走）。
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import PathUtil from "../utils/PathUtil";

/** 全部应用对话的根目录（各库的会话目录在它下面） */
export const chatSessionRoot = (): string => join(PathUtil.getAppDir(), "sessions");

/** 库名 → 会话目录（库名可带或不带 .db 后缀） */
export const chatSessionDirOf = (databaseName: string): string =>
  join(chatSessionRoot(), databaseName.replace(/\.db$/, ""));

/**
 * 已打开的库连接 → 会话目录（better-sqlite3 的 db.name 是库文件路径）。
 * 内存库（测试）没有会话目录，返回 undefined。
 */
export const chatSessionDirOfDb = (db: { name: string; memory?: boolean }): string | undefined =>
  db.memory || db.name === ":memory:" || !db.name ? undefined : chatSessionDirOf(basename(db.name));

export const browserSessionRoot = (): string => join(PathUtil.getAppDir(), "browser-sessions");

/**
 * 页面 → 规范键：去掉 hash 片段（同一页面的锚点跳转不该分成两组对话），其余原样。
 * 非法 URL 按原文处理（扩展侧偶尔传 chrome:// 之类的地址）。
 */
export const normalizePageUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split("#")[0];
  }
};

/** 页面 → 目录名：URL 哈希（URL 不能直接当路径——长度、非法字符、路径穿越） */
export const browserPageKey = (url: string): string =>
  createHash("sha256").update(normalizePageUrl(url)).digest("hex").slice(0, 32);

export const browserSessionDirOf = (url: string): string =>
  join(browserSessionRoot(), browserPageKey(url));

/**
 * 相对会话目录的文件名 → 绝对路径。只接受纯文件名：渲染端/扩展传来的值不可信，
 * 带路径分隔符或 `..` 的一律拒绝，防止读写会话目录以外的文件。
 */
export const resolveSessionFile = (sessionDir: string, sessionFile: string): string => {
  if (!sessionFile || basename(sessionFile) !== sessionFile || sessionFile.startsWith(".")) {
    throw new Error(`非法的会话文件名：${sessionFile}`);
  }
  return join(sessionDir, sessionFile);
};

/** 会话 id 只允许字母数字与连字符（pi 自己生成的与 randomUUID 都满足），挡住带路径的输入 */
export const assertSafeSessionId = (sessionId: string): void => {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) throw new Error(`非法的会话 id：${sessionId}`);
};

/**
 * 按会话 id 找文件（文件名是 pi 的 `<时间戳>_<id>.jsonl`）：扩展只知道会话 id，
 * 文件名由这里在目录内查出来，不拿外部输入拼路径。找不到返回 undefined（还没落盘）。
 */
export const findSessionFileById = (sessionDir: string, sessionId: string): string | undefined => {
  assertSafeSessionId(sessionId);
  if (!existsSync(sessionDir)) return undefined;
  const name = readdirSync(sessionDir).find(file => file.endsWith(`_${sessionId}.jsonl`));
  return name ? join(sessionDir, name) : undefined;
};
