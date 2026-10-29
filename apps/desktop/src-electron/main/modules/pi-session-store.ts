/**
 * pi 会话文件的存储层：会话目录的定位、读投影、改历史、删除、浏览器扩展会话列表、
 * 同步下载的替换。electron-free，可单测；IPC 壳在 pi-session-host.ts。
 *
 * 两类会话目录：
 * - 应用对话：`sessions/<库名>/`，目录行在 chat_session 表里，文件名存在目录行；
 * - 浏览器扩展对话：`browser-sessions/<页面键>/`，无索引表——列表、标题（pi session name）
 *   全部取自会话文件本身；分支在文件内部的会话树上。
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { ChatSessionMessage } from "@/types";
import type { PiBrowserSessionInfo } from "@/types/pi-session";
import { loadSessionTranscript } from "./pi-session-host-core";
import { piEntriesToDesktopMessages } from "./pi-session-transcript";
import {
  conversationTreeOf,
  forkAfterEntry,
  omitEntries,
  rewindToBeforeEntry,
  switchToVersion,
  type ConversationTreeNode,
} from "./pi-session-files";
import { browserSessionDirOf, findSessionFileById } from "./pi-session-paths";

/** 读会话投影；文件不存在（首轮没等到回答 pi 不落盘）= 空对话 */
export function readTranscript(file: string | undefined, sessionDir: string): ChatSessionMessage[] {
  if (!file || !existsSync(file)) return [];
  return piEntriesToDesktopMessages(loadSessionTranscript(file, sessionDir));
}

/** 树谱视图（M4-d）：只含用户消息的精简树；文件不存在 = 空 */
export function readConversationTree(
  file: string | undefined,
  sessionDir: string
): ConversationTreeNode[] {
  if (!file || !existsSync(file)) return [];
  return conversationTreeOf(SessionManager.open(file, sessionDir));
}

/** 投影里的用户消息数（目录行 messageCount 的口径：用户提问次数） */
export const countUserMessages = (messages: ChatSessionMessage[]) =>
  messages.filter(message => message.role === "user").length;

/**
 * 改会话树的操作（M4-d：分支都在同一文件里）：
 * - rewind：编辑重发/重新生成，回到这条用户消息之前；
 * - fork：从这里建分支，回到这条回答之后（下一条消息成为新版本）；
 * - switch：切到一条用户消息所在的版本；
 * - omit：删除消息（context_edit 省略）。
 */
export type SessionEdit =
  | { kind: "rewind"; entryId: string }
  | { kind: "fork"; entryId: string }
  | { kind: "switch"; entryId: string }
  | { kind: "omit"; entryIds: string[] };

/** 在一个 SessionManager 上执行改树操作（宿主会话的或新打开的；调用方负责刷新宿主上下文） */
export function applySessionEdit(manager: SessionManager, edit: SessionEdit): void {
  if (edit.kind === "rewind") rewindToBeforeEntry(manager, edit.entryId);
  else if (edit.kind === "fork") forkAfterEntry(manager, edit.entryId);
  else if (edit.kind === "switch") switchToVersion(manager, edit.entryId);
  else if (edit.entryIds.length > 0) omitEntries(manager, edit.entryIds);
}

/** 没有宿主开着这个文件时：直接打开文件改 */
export function applySessionEditToFile(file: string, edit: SessionEdit): void {
  if (!existsSync(file)) throw new Error("对话还没有保存下来，暂时不能修改历史");
  applySessionEdit(SessionManager.open(file), edit);
}

// ── 浏览器扩展会话 ────────────────────────────────────────────────────────────

/** 一个目录里的全部对话，按最近活动降序 */
export async function listSessionsInDir(dir: string): Promise<PiBrowserSessionInfo[]> {
  if (!existsSync(dir)) return [];
  // listAll(dir) 不按 cwd 过滤（list 会拿 cwd 比对会话头，扩展会话的 cwd 是应用目录）
  const infos = await SessionManager.listAll(dir);
  return infos.map(info => ({
    id: info.id,
    title: info.name || (info.firstMessage !== "(no messages)" ? info.firstMessage : "新对话"),
    createTime: info.created.getTime(),
    updateTime: info.modified.getTime(),
    messageCount: countUserMessages(readTranscript(info.path, dir)),
  }));
}

// 页面 → 目录的包装（浏览器伴读用）
export const listBrowserSessions = (pageUrl: string) =>
  listSessionsInDir(browserSessionDirOf(pageUrl));
export const browserSessionFile = (pageUrl: string, sessionId: string) =>
  findSessionFileById(browserSessionDirOf(pageUrl), sessionId);

/** 同步随库上传的对话记录：会话目录下的全部 .jsonl 文件。 */
export function listSessionFiles(sessionDir: string): string[] {
  return existsSync(sessionDir)
    ? readdirSync(sessionDir)
        .filter(name => name.endsWith(".jsonl"))
        .sort()
    : [];
}
/** 数据库已关闭且持有同步锁时，用下载结果替换库文件；云端带对话记录时一并替换会话目录。 */
export function installDatabaseDownload(
  databasePath: string,
  downloadPath: string,
  sessionDir: string,
  downloadedSessions?: string
): void {
  for (const suffix of ["-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
  renameSync(downloadPath, databasePath);
  if (downloadedSessions) {
    mkdirSync(dirname(sessionDir), { recursive: true });
    rmSync(sessionDir, { recursive: true, force: true });
    renameSync(downloadedSessions, sessionDir);
  }
}
