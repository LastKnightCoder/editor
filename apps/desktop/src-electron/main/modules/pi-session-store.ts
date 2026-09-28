/**
 * pi 会话文件的存储层（M4）：会话目录的定位、读投影、改历史、删除、浏览器扩展会话列表、
 * 同步打包/解包。electron-free，可单测；IPC 壳在 pi-session-host.ts。
 *
 * 两类会话目录：
 * - 应用对话：`sessions/<库名>/`，目录行在 chat_session 表里，文件名存在目录行；
 * - 浏览器扩展对话：`browser-sessions/<页面键>/`，无索引表——列表、标题（pi session name）
 *   全部取自会话文件本身；分支在文件内部的会话树上（M4-d）。
 */
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
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
import { graftSessionFile } from "./pi-session-graft";
import { browserSessionDirOf, findSessionFileById, resolveSessionFile } from "./pi-session-paths";

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

const sessionIdOfPath = (path: string) => /_([^_]+)\.jsonl$/.exec(basename(path))?.[1] ?? "";

/**
 * 页面目录里 M4 留下的分支文件（会话头带 parentSession）并进父文件的树（M4-d）。
 * 扩展会话没有目录表与开库时机，列表时顺手合并；父文件对不上的把 parentSession 去掉、成为独立对话。
 */
export async function mergeBranchFilesInDir(dir: string): Promise<void> {
  if (!existsSync(dir)) return;
  const infos = await SessionManager.listAll(dir);
  const pathById = new Map(infos.map(info => [info.id, info.path]));
  const parentOf = new Map(
    infos
      .filter(info => info.parentSessionPath)
      .map(info => [info.id, sessionIdOfPath(info.parentSessionPath!)])
  );
  const depthOf = (id: string) => {
    let depth = 0;
    for (
      let cursor = parentOf.get(id);
      cursor && depth < infos.length;
      cursor = parentOf.get(cursor)
    )
      depth += 1;
    return depth;
  };
  for (const id of [...parentOf.keys()].sort((a, b) => depthOf(b) - depthOf(a))) {
    const branchPath = pathById.get(id)!;
    const parentPath = pathById.get(parentOf.get(id)!);
    try {
      if (
        parentPath &&
        existsSync(parentPath) &&
        graftSessionFile(parentPath, branchPath).kind === "merged"
      ) {
        rmSync(branchPath, { force: true });
        continue;
      }
    } catch (error) {
      console.error("[pi-session] 合并扩展分支失败:", branchPath, error);
    }
    detachSessionHeader(branchPath);
  }
}

/** 去掉会话头的 parentSession：分支降级为独立对话 */
function detachSessionHeader(file: string): void {
  const [head, ...rest] = readFileSync(file, "utf8").split("\n");
  const header = JSON.parse(head) as Record<string, unknown>;
  delete header.parentSession;
  writeFileSync(file, [JSON.stringify(header), ...rest].join("\n"));
}

/** 一个目录里的全部对话，按最近活动降序（先把 M4 留下的分支文件并进树） */
export async function listSessionsInDir(
  dir: string,
  migrateBranches = true
): Promise<PiBrowserSessionInfo[]> {
  if (!existsSync(dir)) return [];
  if (migrateBranches) await mergeBranchFilesInDir(dir);
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

/** 改名 = 追加 pi 原生 session_info entry（列表的标题就是它） */
export function renameSessionInDir(dir: string, sessionId: string, title: string): void {
  const file = findSessionFileById(dir, sessionId);
  if (!file) throw new Error("对话不存在");
  SessionManager.open(file).appendSessionInfo(title);
}

/** 删除对话（分支都在同一文件里，删文件即可） */
export function deleteSessionInDir(dir: string, sessionId: string): void {
  const file = findSessionFileById(dir, sessionId);
  if (file) rmSync(file, { force: true });
}

// 页面 → 目录的包装（IPC 壳用）
export const listBrowserSessions = (pageUrl: string, migrateBranches = true) =>
  listSessionsInDir(browserSessionDirOf(pageUrl), migrateBranches);
export const browserSessionFile = (pageUrl: string, sessionId: string) =>
  findSessionFileById(browserSessionDirOf(pageUrl), sessionId);
export const renameBrowserSession = (pageUrl: string, sessionId: string, title: string) =>
  renameSessionInDir(browserSessionDirOf(pageUrl), sessionId, title);
export const deleteBrowserSession = (pageUrl: string, sessionId: string) =>
  deleteSessionInDir(browserSessionDirOf(pageUrl), sessionId);

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
  try {
    writeFileSync(tempPath, archive);
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

/** 下载提交前留下回滚日志；下次开库先恢复未提交的数据库与会话目录。 */
export function recoverSessionDownload(databasePath: string): void {
  const journal = `${databasePath}.session-sync.json`;
  if (!existsSync(journal)) return;
  const transaction = JSON.parse(readFileSync(journal, "utf8")) as {
    databaseBackup: string;
    sessionDir: string;
    sessionsBackup: string;
    hadSessions: boolean;
    stage: string;
  };
  copyFileSync(transaction.databaseBackup, databasePath);
  if (existsSync(transaction.sessionsBackup)) {
    rmSync(transaction.sessionDir, { recursive: true, force: true });
    renameSync(transaction.sessionsBackup, transaction.sessionDir);
  } else if (!transaction.hadSessions) {
    rmSync(transaction.sessionDir, { recursive: true, force: true });
  }
  rmSync(transaction.stage, { recursive: true, force: true });
  rmSync(journal);
}

export function installSessionDownload(
  databasePath: string,
  sessionDir: string,
  archive?: Buffer
): void {
  recoverSessionDownload(databasePath);
  const download = `${databasePath}.download.tmp`;
  if (!archive) {
    renameSync(download, databasePath);
    return;
  }
  const stamp = randomUUID();
  const stage = `${sessionDir}.download-${stamp}`;
  const databaseBackup = `${databasePath}.pre-session-sync-${stamp}.bak`;
  const sessionsBackup = `${sessionDir}.pre-session-sync-${stamp}`;
  const journal = `${databasePath}.session-sync.json`;
  try {
    replaceSessionDir(stage, archive, dirname(databaseBackup));
    for (const name of readdirSync(stage)) SessionManager.open(join(stage, name));
    const db = new Database(download, { readonly: true, fileMustExist: true });
    try {
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='chat_session'").get()) {
        const rows = db
          .prepare("SELECT session_file FROM chat_session WHERE message_count > 0")
          .all() as Array<{ session_file: string }>;
        for (const row of rows) {
          if (!existsSync(resolveSessionFile(stage, row.session_file)))
            throw new Error(`会话包缺少文件：${row.session_file}`);
        }
      }
    } finally {
      db.close();
    }
    copyFileSync(databasePath, databaseBackup);
    const hadSessions = existsSync(sessionDir);
    writeFileSync(
      `${journal}.tmp`,
      JSON.stringify({ databaseBackup, sessionDir, sessionsBackup, hadSessions, stage }),
      { flag: "wx" }
    );
    renameSync(`${journal}.tmp`, journal);
    if (hadSessions) renameSync(sessionDir, sessionsBackup);
    renameSync(stage, sessionDir);
    renameSync(download, databasePath);
    rmSync(journal);
  } catch (error) {
    recoverSessionDownload(databasePath);
    throw error;
  } finally {
    rmSync(`${journal}.tmp`, { force: true });
    rmSync(stage, { recursive: true, force: true });
  }
}
