/**
 * pi 会话文件的直接读写（M4）：迁移器、改历史操作（编辑重发/重新生成/删消息）、建分支共用。
 * electron-free，可单测。
 *
 * 两个约定：
 * - **展示 entry**（customType = desktop-display）：用户消息的桌面展示形态（文件卡片、mention、
 *   skills、图片编辑前的原话）。JSONL 里存的是**发给模型的**那一版，直接投影会把
 *   「[文件：x] 路径… 请用 read 工具读取」这种模型提示显示在用户气泡里。custom entry 不进模型
 *   上下文（见 pi sessionEntryToContextMessages），事实源仍是同一份文件。
 * - **叶子标记**（customType = desktop-leaf）：pi 加载文件时取**最后一条 entry** 为叶子，
 *   挪完叶子要追加一条不进上下文的 entry 把位置落盘，否则重开就回到了旧分支的末尾。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  CURRENT_SESSION_VERSION,
  SessionManager,
  parseSessionEntries,
} from "@earendil-works/pi-coding-agent";
import type { Message } from "@earendil-works/pi-ai";
import type { MessageContent } from "@/types";

export const DISPLAY_ENTRY_TYPE = "desktop-display";
export const LEAF_ENTRY_TYPE = "desktop-leaf";

/** 展示 entry 的载荷：按文本认领对应的用户消息（插话的用户消息不紧挨着写入，不能靠位置） */
export interface DesktopDisplayData {
  /** 发给模型的用户消息文本（与 pi user message 的 text 块拼接后逐字相同） */
  modelText: string;
  /** 桌面展示内容（MessageContent 形状，含 file/mention/skills） */
  content: MessageContent[];
  clientId?: string;
}

/** 会话文件名：pi 自己的命名格式 `<时间戳>_<id>.jsonl` */
export const sessionFileNameFor = (sessionId: string, at = new Date()) =>
  `${at.toISOString().replace(/[:.]/g, "-")}_${sessionId}.jsonl`;

const shortId = () => randomUUID().replace(/-/g, "").slice(0, 8);

type RawEntry = { type: string; id?: string; parentId?: string | null; [key: string]: unknown };

/**
 * 直接写一个完整的会话文件（迁移器用）：消息按顺序成链，每条用户消息后跟一条展示 entry。
 * 不走 SessionManager.appendMessage——它要等第一条 assistant 消息才落盘，只有用户消息的
 * 老对话（发出去就失败了的）会写不出文件。
 */
export function writeSessionFile(options: {
  sessionDir: string;
  sessionId: string;
  cwd: string;
  createdAt: number;
  messages: Array<{ message: Message; display?: DesktopDisplayData }>;
}): string {
  mkdirSync(options.sessionDir, { recursive: true });
  const fileName = sessionFileNameFor(options.sessionId, new Date(options.createdAt));
  const lines: RawEntry[] = [
    {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: options.sessionId,
      timestamp: new Date(options.createdAt).toISOString(),
      cwd: options.cwd,
    },
  ];
  let parentId: string | null = null;
  for (const { message, display } of options.messages) {
    const timestamp = new Date(message.timestamp ?? options.createdAt).toISOString();
    const id = shortId();
    lines.push({ type: "message", id, parentId, timestamp, message });
    parentId = id;
    if (display) {
      const displayId = shortId();
      lines.push({
        type: "custom",
        customType: DISPLAY_ENTRY_TYPE,
        data: display,
        id: displayId,
        parentId,
        timestamp,
      });
      parentId = displayId;
    }
  }
  writeFileSync(
    join(options.sessionDir, fileName),
    `${lines.map(line => JSON.stringify(line)).join("\n")}\n`
  );
  return fileName;
}

/** 在已有会话文件末尾追加一条展示 entry（新发送的用户消息，由主进程在 prompt 后写入） */
export function appendDisplayEntry(manager: SessionManager, display: DesktopDisplayData): void {
  manager.appendCustomEntry(DISPLAY_ENTRY_TYPE, display);
}

/** 叶子路径上「第 N 条用户消息」对应的 entry（改历史操作按桌面消息下标定位） */
function findUserEntryAt(manager: SessionManager, userIndex: number) {
  const users = manager
    .getBranch()
    .filter(
      entry =>
        entry.type === "message" && (entry as { message: { role: string } }).message.role === "user"
    );
  return users[userIndex];
}

/**
 * 编辑重发 / 重新生成：把叶子挪到第 userIndex 条用户消息之前。旧的回答留在树上（M4-d 分支导航
 * 可见），下一次 prompt 从新叶子接着写。挪完追加叶子标记，让重开时 pi 也落在这里。
 */
export function rewindToBeforeUser(sessionFile: string, userIndex: number): void {
  const manager = SessionManager.open(sessionFile);
  const target = findUserEntryAt(manager, userIndex);
  if (!target) throw new Error(`找不到第 ${userIndex + 1} 条用户消息`);
  if (target.parentId === null) manager.resetLeaf();
  else manager.branch(target.parentId);
  manager.appendCustomEntry(LEAF_ENTRY_TYPE, { reason: "rewind" });
  ensureFlushed(manager);
}

/**
 * 删除单条消息：pi 原生的 context_edit(target, null)，把它从模型上下文里去掉；
 * 展示投影同样尊重这条编辑（见 loadSessionTranscript）。用户消息连带它的展示 entry 一起隐藏。
 */
export function omitEntries(sessionFile: string, entryIds: string[]): void {
  const manager = SessionManager.open(sessionFile);
  for (const entryId of entryIds) manager.appendContextEdit(entryId, null);
  ensureFlushed(manager);
}

/**
 * 从当前路径拷出一个分支文件（建分支）：pi 的 createBranchedSession 会给新文件一个随机 id，
 * 这里要求新文件 id = 目录表主键，所以按文本重写头部 id。
 * 返回新会话文件名（相对会话目录）。
 */
export function branchSessionFile(options: {
  sessionDir: string;
  sourceFile: string;
  newSessionId: string;
  /** 保留到第几条用户消息（含其后的回答）；缺省保留整条路径 */
  throughUserIndex?: number;
}): string {
  const manager = SessionManager.open(options.sourceFile, options.sessionDir);
  const branch = manager.getBranch();
  let leafId = branch.at(-1)?.id;
  if (options.throughUserIndex !== undefined) {
    const nextUser = findUserEntryAt(manager, options.throughUserIndex + 1);
    // 截到下一条用户消息之前：保留第 N 条用户消息与它的全部回答
    leafId = nextUser ? (nextUser.parentId ?? undefined) : leafId;
  }
  const kept = leafId
    ? branch.slice(0, branch.findIndex(entry => entry.id === leafId) + 1)
    : branch;
  const now = new Date();
  const fileName = sessionFileNameFor(options.newSessionId, now);
  const header = {
    type: "session",
    version: CURRENT_SESSION_VERSION,
    id: options.newSessionId,
    timestamp: now.toISOString(),
    cwd: manager.getCwd(),
    parentSession: options.sourceFile,
  };
  // 拷贝时重新成链：路径上可能夹着 label/leaf 之类的 entry，跳过的要把父指针接上
  let parentId: string | null = null;
  const lines: RawEntry[] = [header];
  for (const entry of kept) {
    if (entry.type === "label") continue;
    if (
      entry.type === "custom" &&
      (entry as { customType?: string }).customType === LEAF_ENTRY_TYPE
    )
      continue;
    lines.push({ ...(entry as unknown as RawEntry), parentId });
    parentId = entry.id;
  }
  writeFileSync(
    join(options.sessionDir, fileName),
    `${lines.map(line => JSON.stringify(line)).join("\n")}\n`
  );
  return fileName;
}

/**
 * 改历史操作后确保落盘：pi 要等出现 assistant 消息才首次写文件；
 * 只有用户消息的文件（首轮就失败的对话）改完也得写下去，否则改动丢失。
 */
function ensureFlushed(manager: SessionManager): void {
  const file = manager.getSessionFile();
  if (!file) return;
  const hasAssistant = manager
    .getEntries()
    .some(
      entry =>
        entry.type === "message" &&
        (entry as { message: { role: string } }).message.role === "assistant"
    );
  if (hasAssistant && existsSync(file)) return;
  const header = manager.getHeader();
  const entries = [header, ...manager.getEntries()].filter(Boolean);
  writeFileSync(file, `${entries.map(entry => JSON.stringify(entry)).join("\n")}\n`);
}

/** 解析会话文件（纯读，供测试与诊断） */
export function readSessionEntries(sessionFile: string): RawEntry[] {
  return parseSessionEntries(readFileSync(sessionFile, "utf8")) as unknown as RawEntry[];
}

/** 追加一行原始 entry（测试辅助：模拟外部写入） */
export function appendRawEntry(sessionFile: string, entry: RawEntry): void {
  appendFileSync(sessionFile, `${JSON.stringify(entry)}\n`);
}
