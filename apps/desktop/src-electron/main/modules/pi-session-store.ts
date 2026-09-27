/**
 * pi 会话文件的存储层（M4）：会话目录的定位、读投影、改历史、删除、浏览器扩展会话列表、
 * 同步打包/解包。electron-free，可单测；IPC 壳在 pi-session-host.ts。
 *
 * 两类会话目录：
 * - 应用对话：`sessions/<库名>/`，目录行在 chat_session 表里，文件名存在目录行；
 * - 浏览器扩展对话：`browser-sessions/<页面键>/`，无索引表——列表、标题（pi session name）、
 *   分支关系（会话头 parentSession）全部取自会话文件本身。
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import AdmZip from "adm-zip";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { ChatSessionMessage } from "@/types";
import type { PiBrowserSessionInfo } from "@/types/pi-session";
import { loadSessionTranscript } from "./pi-session-host-core";
import { piEntriesToDesktopMessages } from "./pi-session-transcript";
import { branchSessionFile, omitEntries, rewindToBeforeEntry } from "./pi-session-files";
import { browserSessionDirOf, findSessionFileById } from "./pi-session-paths";

/** 读会话投影；文件不存在（首轮没等到回答 pi 不落盘）= 空对话 */
export function readTranscript(file: string | undefined, sessionDir: string): ChatSessionMessage[] {
  if (!file || !existsSync(file)) return [];
  return piEntriesToDesktopMessages(loadSessionTranscript(file, sessionDir));
}

/** 投影里的用户消息数（目录行 messageCount 的口径：用户提问次数） */
export const countUserMessages = (messages: ChatSessionMessage[]) =>
  messages.filter(message => message.role === "user").length;

/** 改历史操作（编辑重发/重新生成、删除、建分支）的统一入口，调用方保证宿主会话已 dispose */
export type SessionEdit =
  | { kind: "rewind"; entryId: string }
  | { kind: "omit"; entryIds: string[] }
  | { kind: "branch"; newSessionId: string; throughEntryId?: string };

export function applySessionEdit(
  file: string,
  sessionDir: string,
  edit: SessionEdit
): { sessionFile?: string } {
  if (!existsSync(file)) throw new Error("对话还没有保存下来，暂时不能修改历史");
  if (edit.kind === "rewind") {
    rewindToBeforeEntry(file, edit.entryId);
    return {};
  }
  if (edit.kind === "omit") {
    if (edit.entryIds.length > 0) omitEntries(file, edit.entryIds);
    return {};
  }
  return {
    sessionFile: branchSessionFile({
      sessionDir,
      sourceFile: file,
      newSessionId: edit.newSessionId,
      ...(edit.throughEntryId ? { throughEntryId: edit.throughEntryId } : {}),
    }),
  };
}

// ── 浏览器扩展会话 ────────────────────────────────────────────────────────────

const sessionIdOfPath = (path: string) => /_([^_]+)\.jsonl$/.exec(basename(path))?.[1] ?? "";

/** 一个目录里的全部对话（含分支），按最近活动降序 */
export async function listSessionsInDir(dir: string): Promise<PiBrowserSessionInfo[]> {
  if (!existsSync(dir)) return [];
  // listAll(dir) 不按 cwd 过滤（list 会拿 cwd 比对会话头，扩展会话的 cwd 是应用目录）
  const infos = await SessionManager.listAll(dir);
  return infos.map(info => ({
    id: info.id,
    title: info.name || (info.firstMessage !== "(no messages)" ? info.firstMessage : "新对话"),
    parentId: info.parentSessionPath ? sessionIdOfPath(info.parentSessionPath) || null : null,
    createTime: info.created.getTime(),
    updateTime: info.modified.getTime(),
    messageCount: info.messageCount,
  }));
}

/** 改名 = 追加 pi 原生 session_info entry（列表的标题就是它） */
export function renameSessionInDir(dir: string, sessionId: string, title: string): void {
  const file = findSessionFileById(dir, sessionId);
  if (!file) throw new Error("对话不存在");
  SessionManager.open(file).appendSessionInfo(title);
}

/** 删除对话连带它的分支子树（按会话头 parentSession 还原的树），返回被删的 id */
export async function deleteSessionTreeInDir(dir: string, sessionId: string): Promise<string[]> {
  const sessions = await listSessionsInDir(dir);
  const doomed = new Set([sessionId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const session of sessions) {
      if (session.parentId && doomed.has(session.parentId) && !doomed.has(session.id)) {
        doomed.add(session.id);
        grew = true;
      }
    }
  }
  for (const id of doomed) {
    const file = findSessionFileById(dir, id);
    if (file) rmSync(file, { force: true });
  }
  return [...doomed];
}

// 页面 → 目录的包装（IPC 壳用）
export const listBrowserSessions = (pageUrl: string) =>
  listSessionsInDir(browserSessionDirOf(pageUrl));
export const browserSessionFile = (pageUrl: string, sessionId: string) =>
  findSessionFileById(browserSessionDirOf(pageUrl), sessionId);
export const renameBrowserSession = (pageUrl: string, sessionId: string, title: string) =>
  renameSessionInDir(browserSessionDirOf(pageUrl), sessionId, title);
export const deleteBrowserSession = (pageUrl: string, sessionId: string) =>
  deleteSessionTreeInDir(browserSessionDirOf(pageUrl), sessionId);

// ── 同步：会话目录打包 / 解包 ───────────────────────────────────────────────────

/** 空 zip 的固定字节（End of central directory，22 字节）：与「坏包」区分开 */
const isEmptyZip = (archive: Buffer) =>
  archive.length === 22 && archive.subarray(0, 4).toString("hex") === "504b0506";

/** 把会话目录打成 zip（只收 .jsonl；目录不存在给空包，表示「本机没有会话」） */
export function packSessionDir(sessionDir: string): Buffer {
  const zip = new AdmZip();
  if (existsSync(sessionDir)) {
    for (const name of readdirSync(sessionDir)) {
      if (name.endsWith(".jsonl")) zip.addLocalFile(join(sessionDir, name));
    }
  }
  return zip.toBuffer();
}

/**
 * 用下载的会话包替换本地会话目录：先把整个目录挪进 backupRoot 备份，再解包。
 * 解包失败时把备份挪回来，本地不会落到「半截目录」。条目名只取 basename，防 zip 路径穿越。
 */
export function replaceSessionDir(
  sessionDir: string,
  archive: Buffer,
  backupRoot: string
): { backupPath?: string } {
  mkdirSync(backupRoot, { recursive: true });
  let backupPath: string | undefined;
  if (existsSync(sessionDir)) {
    backupPath = join(backupRoot, `${basename(sessionDir)}-sessions-${Date.now()}`);
    renameSync(sessionDir, backupPath);
  }
  // 落到临时文件再按路径打开：adm-zip 的 Buffer 模式在某些运行环境里读不出条目（实测 vitest 下
  // 同一个包 getEntries() 为空），按路径读两处都稳
  const tempPath = join(backupRoot, `sessions-download-${Date.now()}.zip`);
  writeFileSync(tempPath, archive);
  try {
    mkdirSync(sessionDir, { recursive: true });
    const entries = new AdmZip(tempPath).getEntries();
    // 空包有两种：本机没有对话（合法），或下载到的不是 zip（adm-zip 对坏数据不抛，只给空清单）。
    // 非空载荷却解不出条目就是坏包，按失败回滚，免得把本地会话换成空目录
    if (entries.length === 0 && archive.length > 0 && !isEmptyZip(archive)) {
      throw new Error("会话包内容无法解析");
    }
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      // 条目名只取文件名：包里带路径也只落在会话目录内（防 zip 路径穿越）
      const name = basename(entry.entryName);
      if (!name.endsWith(".jsonl")) continue;
      writeFileSync(join(sessionDir, name), entry.getData());
    }
    return backupPath ? { backupPath } : {};
  } catch (error) {
    rmSync(sessionDir, { recursive: true, force: true });
    if (backupPath) {
      mkdirSync(dirname(sessionDir), { recursive: true });
      renameSync(backupPath, sessionDir);
    }
    throw error;
  } finally {
    rmSync(tempPath, { force: true });
  }
}
