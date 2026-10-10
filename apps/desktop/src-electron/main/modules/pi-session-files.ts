/**
 * pi 会话文件的直接读写（M4）：迁移器、改历史操作（编辑重发/重新生成/删消息/建分支/切版本）共用。
 * electron-free，可单测。
 *
 * 分支 = 会话树（M4-d）：一个对话一个文件，编辑重发、重新生成、从这里建分支都是在同一文件的
 * 树上分叉；同一位置的多条用户消息互为「版本」（messageVersionsOf），界面上 ‹ i/n › 切换。
 * 改树的操作都接收一个 SessionManager：宿主会话空闲时直接用它的（改完 refreshContext，
 * 会话授权不丢），没开着时由调用方 SessionManager.open。
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
import { recordSyncIo } from "./perf-record";
import {
  CURRENT_SESSION_VERSION,
  SessionManager,
  parseSessionEntries,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { Message } from "@earendil-works/pi-ai";
import type { MessageContent } from "@/types";
import type { ConversationTreeNode } from "@/types/pi-session";

export type { ConversationTreeNode };

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
  const sessionFilePath = join(options.sessionDir, fileName);
  const content = `${lines.map(line => JSON.stringify(line)).join("\n")}\n`;
  const syncIoStart = Date.now();
  writeFileSync(sessionFilePath, content);
  recordSyncIo(`write:${sessionFilePath}`, content.length, Date.now() - syncIoStart);
  return fileName;
}

/** 在已有会话文件末尾追加一条展示 entry（新发送的用户消息，由主进程在 prompt 后写入） */
export function appendDisplayEntry(manager: SessionManager, display: DesktopDisplayData): void {
  manager.appendCustomEntry(DISPLAY_ENTRY_TYPE, display);
}

const omittedTargetsOn = (path: SessionEntry[]) =>
  path
    .filter(entry => entry.type === "context_edit")
    .filter(entry => (entry as { replacement: unknown }).replacement === null)
    .map(entry => (entry as { targetId: string }).targetId);

/**
 * 会话树上的所有导航（回退、分叉、切版本）共用的一步：把叶子挪到 targetId（null = 回到根之前），
 * 追加叶子标记落盘。
 *
 * 删除（context_edit）只作用于它所在的路径：挪到别的路径上，删过的消息会重新出现。
 * 所以把旧路径上的省略里、目标仍在新路径上且新路径还没省略的，重新挂到新叶子上——
 * 删过的消息在所有版本里都保持删除。
 */
function moveLeafTo(manager: SessionManager, targetId: string | null, reason: string): void {
  const omitted = omittedTargetsOn(manager.getBranch());
  if (targetId === null) manager.resetLeaf();
  else manager.branch(targetId);
  const newPath = manager.getBranch();
  const onPath = new Set(newPath.map(entry => entry.id));
  const alreadyOmitted = new Set(omittedTargetsOn(newPath));
  for (const target of new Set(omitted)) {
    if (onPath.has(target) && !alreadyOmitted.has(target)) manager.appendContextEdit(target, null);
  }
  manager.appendCustomEntry(LEAF_ENTRY_TYPE, { reason });
  ensureFlushed(manager);
}

const entryOnPath = (manager: SessionManager, entryId: string): SessionEntry => {
  const target = manager.getBranch().find(entry => entry.id === entryId);
  if (!target) throw new Error("这条消息已不在当前对话里");
  return target;
};

/**
 * 编辑重发 / 重新生成：回到这条用户消息（entryId）之前，下一次 prompt 写出它的一个新版本。
 * 定位用投影带回的 entry id，不用消息下标——被删除（省略）的消息仍在路径上，下标会错位。
 * 旧的版本留在树上，可以切回去（switchToVersion）。
 */
export function rewindToBeforeEntry(manager: SessionManager, entryId: string): void {
  moveLeafTo(manager, entryOnPath(manager, entryId).parentId, "rewind");
}

/**
 * 从这里建分支：回到这条 entry（一条回答的最后一个 entry）之后，接下来发送的消息
 * 成为原来下一条用户消息的另一个版本。
 */
export function forkAfterEntry(manager: SessionManager, entryId: string): void {
  moveLeafTo(manager, entryOnPath(manager, entryId).id, "fork");
}

/**
 * 切到一条用户消息所在的版本：落到它子树里**最近写入**的 entry（用户最后在这个版本里看到的位置），
 * 而不是它自己——切回去应该看到这个版本当时的完整对话。
 */
export function switchToVersion(manager: SessionManager, userEntryId: string): void {
  const entries = manager.getEntries();
  if (!entries.some(entry => entry.id === userEntryId)) throw new Error("这个版本已不存在");
  // 文件顺序即写入顺序，父一定在子之前：一遍扫描收集子树并取最后一个
  const subtree = new Set([userEntryId]);
  let latest = userEntryId;
  for (const entry of entries) {
    if (entry.parentId && subtree.has(entry.parentId)) {
      subtree.add(entry.id);
      latest = entry.id;
    }
  }
  moveLeafTo(manager, latest, "switch");
}

/** 一条用户消息的全部版本（按写入顺序）与它自己是第几个 */
export interface MessageVersions {
  ids: string[];
  index: number;
}

/**
 * 对话里的消息（user / assistant / toolResult）。pi 的 system 消息 entry（系统提示与工具集快照，
 * 活会话每次提示词或工具变化前写一条）不算——它和叶子标记一样是结构性的，不是对话内容。
 */
export const isConversationMessage = (entry: SessionEntry): boolean =>
  entry.type === "message" && (entry as { message: { role?: string } }).message.role !== "system";

/**
 * 同一位置的用户消息版本：以「最近的**对话消息**祖先」归组，而不是直接父节点——
 * 回退/分叉会在分叉点写叶子标记、重挂省略，pi 发送前还可能写一条 system 快照，新版本的直接父节点
 * 是这些结构性 entry，与原版本并不是 pi 树上的直接兄弟。只返回有多个版本的用户消息。
 */
export function messageVersionsOf(
  entries: ReadonlyArray<SessionEntry>
): Map<string, MessageVersions> {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const anchorCache = new Map<string, string | null>();
  const messageAnchorOf = (entry: SessionEntry): string | null => {
    const cached = anchorCache.get(entry.id);
    if (cached !== undefined) return cached;
    let parent = entry.parentId ? byId.get(entry.parentId) : undefined;
    const walked: string[] = [];
    let anchor: string | null = null;
    while (parent) {
      if (isConversationMessage(parent)) {
        anchor = parent.id;
        break;
      }
      const known = anchorCache.get(parent.id);
      if (known !== undefined) {
        anchor = known;
        break;
      }
      walked.push(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    // 途经的非消息 entry 的消息祖先相同，一起缓存（长链上避免重复回溯）
    for (const id of walked) anchorCache.set(id, anchor);
    anchorCache.set(entry.id, anchor);
    return anchor;
  };

  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    if ((entry as { message: { role?: string } }).message.role !== "user") continue;
    const key = messageAnchorOf(entry) ?? "";
    const group = groups.get(key);
    if (group) group.push(entry.id);
    else groups.set(key, [entry.id]);
  }
  const out = new Map<string, MessageVersions>();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id, index) => out.set(id, { ids, index }));
  }
  return out;
}

/** 用户消息文本截断长度（展示形态优先；删除的节点界面淡化，树的形状不变） */
const TREE_TEXT_LIMIT = 80;

/**
 * 会话树 → 只含用户消息的精简树（M4-d 树谱视图）。结构性 entry、回答、工具结果都折叠：
 * 节点的父 = 最近的**用户消息**祖先；回答计到它前面那条用户消息上。
 * 删除判定按**当前路径**上的省略（省略只作用于它所在的分支，别的分支上的节点不淡化）。
 */
export function conversationTreeOf(
  manager: Pick<SessionManager, "getEntries" | "getBranch">
): ConversationTreeNode[] {
  const entries = manager.getEntries();
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const path = manager.getBranch();
  const onPath = new Set(path.map(entry => entry.id));
  const omitted = new Set(omittedTargetsOn(path));
  const isUser = (entry: SessionEntry) =>
    entry.type === "message" && (entry as { message: { role?: string } }).message.role === "user";

  // 最近的用户消息祖先（迭代 + 缓存：长对话的链有上千条 entry，递归会爆栈）
  const userAnchor = new Map<string, string | null>();
  const anchorOf = (entry: SessionEntry): string | null => {
    const walked: string[] = [];
    let anchor: string | null = null;
    let parent = entry.parentId ? byId.get(entry.parentId) : undefined;
    while (parent) {
      if (isUser(parent)) {
        anchor = parent.id;
        break;
      }
      const cached = userAnchor.get(parent.id);
      if (cached !== undefined) {
        anchor = cached;
        break;
      }
      walked.push(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    for (const id of walked) userAnchor.set(id, anchor);
    return anchor;
  };

  // 展示形态：展示 entry 按模型文本认领紧随其后的用户消息（与投影同一规则的简化版）
  const displayText = new Map<string, string>();
  for (const entry of entries) {
    if (
      entry.type !== "custom" ||
      (entry as { customType?: string }).customType !== DISPLAY_ENTRY_TYPE
    )
      continue;
    const anchor = anchorOf(entry);
    const data = (entry as { data?: DesktopDisplayData }).data;
    if (!anchor || !data || displayText.has(anchor)) continue;
    const text = data.content
      .map(item => (item.type === "text" ? item.text : item.type === "file" ? `[文件]` : ""))
      .filter(Boolean)
      .join(" ");
    if (text) displayText.set(anchor, text);
  }

  const nodes = new Map<string, ConversationTreeNode>();
  for (const entry of entries) {
    if (!isUser(entry)) continue;
    const content = (entry as { message: { content: unknown } }).message.content;
    const raw =
      displayText.get(entry.id) ??
      (typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .filter((block: { type: string }) => block.type === "text")
              .map((block: { text?: string }) => block.text ?? "")
              .join(" ")
          : "");
    const text = raw.replace(/\s+/g, " ").trim();
    nodes.set(entry.id, {
      id: entry.id,
      parentId: anchorOf(entry),
      text: text.length > TREE_TEXT_LIMIT ? `${text.slice(0, TREE_TEXT_LIMIT)}…` : text,
      answered: false,
      time: Date.parse(entry.timestamp) || 0,
      onPath: onPath.has(entry.id),
      omitted: omitted.has(entry.id),
    });
  }
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    if ((entry as { message: { role?: string } }).message.role !== "assistant") continue;
    const anchor = anchorOf(entry);
    const node = anchor ? nodes.get(anchor) : undefined;
    if (!node) continue;
    node.answered = true;
    node.time = Math.max(node.time, Date.parse(entry.timestamp) || 0);
  }
  return [...nodes.values()];
}

/** 补给悬挂工具调用的结果文本（模型与工具卡都能看到） */
export const INTERRUPTED_TOOL_RESULT =
  "应用重启，这次工具调用已中断，没有执行结果。需要的话请重新发起。";

/**
 * 重开会话时收尾悬挂的工具调用（M4-e，用户裁决：审批与提问都标为已中断）：主进程重启前停在「等待审批 /
 * 等待作答 / 执行中」的调用，文件里只有带 toolCall 的 assistant message、没有 toolResult。
 * pi-ai 发请求时会临时补一个 "No result provided" 错误结果让对话能继续，但它**不落盘**——
 * 工具卡永远停在等待中。这里在当前路径末尾给每个缺结果的调用写一条 isError 的 toolResult 并落盘，
 * 卡片投影成失败、下一轮模型也看到明确的中断说明。
 *
 * 只看当前叶子路径上**最后一条** assistant 之后：更早的回答里有调用没结果是 pi 自己的问题（它每批工具
 * 会写齐结果），不在这里补。返回补了几条。
 */
export function closeDanglingToolCalls(manager: SessionManager): number {
  const path = manager.getBranch();
  let lastAssistant = -1;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const entry = path[index];
    if (entry.type !== "message") continue;
    const role = (entry as { message: { role?: string } }).message.role;
    if (role === "assistant") {
      lastAssistant = index;
      break;
    }
    // 最后一条对话消息是用户消息：回答还没开始，没有悬挂调用
    if (role === "user") return 0;
  }
  if (lastAssistant < 0) return 0;
  const assistant = (path[lastAssistant] as { message: { content?: unknown } }).message;
  const calls = (Array.isArray(assistant.content) ? assistant.content : []).filter(
    (block: { type?: string; id?: string }) => block.type === "toolCall" && block.id
  ) as Array<{ id: string; name?: string }>;
  if (calls.length === 0) return 0;
  const answered = new Set(
    path
      .slice(lastAssistant + 1)
      .filter(entry => entry.type === "message")
      .map(entry => (entry as { message: { role?: string; toolCallId?: string } }).message)
      .filter(message => message.role === "toolResult" && message.toolCallId)
      .map(message => message.toolCallId!)
  );
  const dangling = calls.filter(call => !answered.has(call.id));
  for (const call of dangling) {
    manager.appendMessage({
      role: "toolResult",
      toolCallId: call.id,
      toolName: call.name ?? "",
      content: [{ type: "text", text: INTERRUPTED_TOOL_RESULT }],
      isError: true,
      timestamp: Date.now(),
    } as never);
  }
  if (dangling.length > 0) ensureFlushed(manager);
  return dangling.length;
}

/**
 * 删除单条消息：pi 原生的 context_edit(target, null)，把它从模型上下文里去掉；
 * 展示投影同样尊重这条编辑（见 loadSessionTranscript）。用户消息连带它的展示 entry 一起隐藏。
 */
export function omitEntries(manager: SessionManager, entryIds: string[]): void {
  for (const entryId of entryIds) manager.appendContextEdit(entryId, null);
  ensureFlushed(manager);
}

/**
 * 改历史操作后确保落盘：pi 要等出现 assistant 消息才首次写文件；
 * 只有用户消息的文件（首轮就失败的对话）改完也得写下去，否则改动丢失。
 */
function ensureFlushed(manager: SessionManager): void {
  const file = manager.getSessionFile();
  if (!file) return;
  // 已打开文件的 append 由 pi 持久化，包括只有 user 的历史，不能再用内存整文件覆盖。
  if (existsSync(file)) return;
  const header = manager.getHeader();
  const entries = [header, ...manager.getEntries()].filter(Boolean);
  const content = `${entries.map(entry => JSON.stringify(entry)).join("\n")}\n`;
  const syncIoStart = Date.now();
  writeFileSync(file, content, { flag: "wx" });
  recordSyncIo(`write:${file}`, content.length, Date.now() - syncIoStart);
  manager.setSessionFile(file);
}

/** 解析会话文件（纯读，供测试与诊断） */
export function readSessionEntries(sessionFile: string): RawEntry[] {
  const syncIoStart = Date.now();
  const raw = readFileSync(sessionFile, "utf8");
  recordSyncIo(`read:${sessionFile}`, raw.length, Date.now() - syncIoStart);
  return parseSessionEntries(raw) as unknown as RawEntry[];
}

/** 追加一行原始 entry（测试辅助：模拟外部写入） */
export function appendRawEntry(sessionFile: string, entry: RawEntry): void {
  appendFileSync(sessionFile, `${JSON.stringify(entry)}\n`);
}
