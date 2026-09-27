/**
 * 把一个分支文件嫁接进另一个会话文件的树（M4-d）：旧的「分支 = 另拷一个文件」合并成同一文件内的
 * 会话树。开库迁移（chat-session-tree-migration）与浏览器扩展会话目录共用。electron-free，可单测。
 *
 * 分支文件是「父对话的一段路径 + 分叉后的新内容」。按 entry 从前往后与目标树比对：
 * - 对得上的（公共前缀）只记映射，不写；
 * - 第一个对不上的 entry 起，它与它的全部后代嫁接到目标树里对应的父节点下。
 * 比对规则：id 相同直接认（M4 之后建的分支拷贝时保留了 entry id）；否则按内容认——迁移来的老分支
 * 每个文件的 entry id 都是随机生成的，只能比角色 + 内容（不比时间戳与 usage）。
 * 目标树在分叉点可能夹着叶子标记、重挂的省略这类非消息 entry，查候选时穿过它们。
 *
 * 嫁接追加在目标文件末尾，最后补一条叶子标记指回目标原来的叶子：pi 取文件末条 entry 为叶子，
 * 不补的话目标对话一打开就落到了刚嫁接进来的分支上。
 */
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { SessionManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { DISPLAY_ENTRY_TYPE, LEAF_ENTRY_TYPE, isConversationMessage } from "./pi-session-files";

export type GraftOutcome =
  /** 已合并（含「分支没有新内容」的空合并）：调用方删掉源文件 */
  | { kind: "merged"; grafted: number }
  /** 第一条消息就对不上：两者无关，调用方把源文件留作独立对话 */
  | { kind: "unrelated" };

type Raw = SessionEntry & Record<string, unknown>;

const isDisplay = (entry: SessionEntry) =>
  entry.type === "custom" && (entry as Raw).customType === DISPLAY_ENTRY_TYPE;
const isLeafMarker = (entry: SessionEntry) =>
  entry.type === "custom" && (entry as Raw).customType === LEAF_ENTRY_TYPE;
/**
 * 参与比对的实体：对话消息与它的展示 entry；其余（system 快照、叶子标记、省略、改名、标签…）
 * 是结构性的——公共前缀里的不比、不写，嫁接区里的照常带过去
 */
const isContent = (entry: SessionEntry) => isConversationMessage(entry) || isDisplay(entry);

const messageKey = (entry: SessionEntry): string => {
  const message = (entry as Raw).message as Record<string, unknown>;
  return JSON.stringify([message.role, message.content, message.toolCallId ?? null]);
};
const displayKey = (entry: SessionEntry): string =>
  JSON.stringify(((entry as Raw).data as { modelText?: string } | undefined)?.modelText ?? null);

const sameContent = (a: SessionEntry, b: SessionEntry): boolean => {
  if (a.type === "message" && b.type === "message") return messageKey(a) === messageKey(b);
  if (isDisplay(a) && isDisplay(b)) return displayKey(a) === displayKey(b);
  return false;
};

const shortId = () => randomUUID().replace(/-/g, "").slice(0, 8);

export function graftSessionFile(targetFile: string, sourceFile: string): GraftOutcome {
  const target = SessionManager.open(targetFile);
  const source = SessionManager.open(sourceFile);
  const targetEntries = target.getEntries();
  const targetById = new Map(targetEntries.map(entry => [entry.id, entry]));
  const childrenOf = new Map<string | null, SessionEntry[]>();
  for (const entry of targetEntries) {
    const list = childrenOf.get(entry.parentId) ?? [];
    list.push(entry);
    childrenOf.set(entry.parentId, list);
  }

  /** parent 之下的内容 entry 候选：穿过非内容 entry（分叉点的叶子标记、重挂的省略） */
  const contentUnder = (parentId: string | null): SessionEntry[] => {
    const out: SessionEntry[] = [];
    const queue = [...(childrenOf.get(parentId) ?? [])];
    while (queue.length > 0) {
      const entry = queue.shift()!;
      if (isContent(entry)) out.push(entry);
      else queue.push(...(childrenOf.get(entry.id) ?? []));
    }
    return out;
  };

  /** 源 entry id → 目标树里的 id（公共前缀里是对上的那条，嫁接区里是新写的那条） */
  const mapped = new Map<string, string | null>();
  const grafted = new Set<string>();
  const usedIds = new Set(targetById.keys());
  const lines: Raw[] = [];
  let sawFirstContent = false;
  /** 源分支在公共前缀上做的删除（省略目标已映射到目标树）：分叉时补挂到嫁接出的路径上 */
  const prefixOmits: string[] = [];

  /** 目标树里 id 的祖先链（含自身），用来判断省略目标是否在分叉点之上 */
  const ancestorsOf = (id: string | null): Set<string> => {
    const out = new Set<string>();
    let cursor = id ? targetById.get(id) : undefined;
    while (cursor) {
      out.add(cursor.id);
      cursor = cursor.parentId ? targetById.get(cursor.parentId) : undefined;
    }
    return out;
  };

  const pushLine = (entry: Raw) => {
    lines.push(entry);
    usedIds.add(entry.id);
  };

  for (const entry of source.getEntries()) {
    let parent = entry.parentId === null ? null : (mapped.get(entry.parentId) ?? null);
    const inGraft = entry.parentId !== null && grafted.has(entry.parentId);

    if (!inGraft) {
      if (targetById.has(entry.id)) {
        mapped.set(entry.id, entry.id);
        if (isContent(entry)) sawFirstContent = true;
        continue;
      }
      if (!isContent(entry)) {
        // 源分支自己的结构性 entry（叶子标记、改名…）：不写，映射穿透到它的父；
        // 删除记下来，分叉时补挂
        if (entry.type === "context_edit" && (entry as Raw).replacement === null) {
          const remapped = mapped.get((entry as Raw).targetId as string);
          if (remapped) prefixOmits.push(remapped);
        }
        mapped.set(entry.id, parent);
        continue;
      }
      const match = contentUnder(parent).find(candidate => sameContent(candidate, entry));
      if (match) {
        mapped.set(entry.id, match.id);
        sawFirstContent = true;
        continue;
      }
      // 第一条内容就对不上：两个文件没有公共前缀
      if (!sawFirstContent) return { kind: "unrelated" };
      // 分叉点：源分支在公共前缀上删过的消息，在嫁接出的这条路径上也要保持删除
      const above = ancestorsOf(parent);
      for (const omitted of new Set(prefixOmits)) {
        if (!above.has(omitted)) continue;
        const id = shortId();
        pushLine({
          type: "context_edit",
          targetId: omitted,
          replacement: null,
          id,
          parentId: parent,
          timestamp: (entry as Raw).timestamp,
        } as unknown as Raw);
        parent = id;
      }
    }

    // 嫁接区：叶子标记与改名不带过去（叶子由目标自己的标记决定，标题属于目标对话）
    if (isLeafMarker(entry) || entry.type === "session_info" || entry.type === "label") {
      mapped.set(entry.id, parent);
      grafted.add(entry.id);
      continue;
    }
    const id = usedIds.has(entry.id) ? shortId() : entry.id;
    usedIds.add(id);
    const line: Raw = { ...(entry as Raw), id, parentId: parent };
    if (entry.type === "context_edit") {
      const targetId = (entry as Raw).targetId as string;
      const remapped = mapped.get(targetId);
      if (!remapped) {
        // 省略的目标不在合并结果里（源分支自己的结构性 entry）：丢掉这条省略
        mapped.set(entry.id, parent);
        grafted.add(entry.id);
        continue;
      }
      line.targetId = remapped;
    }
    lines.push(line);
    mapped.set(entry.id, id);
    grafted.add(entry.id);
  }

  if (lines.length === 0) return { kind: "merged", grafted: 0 };
  const leafId = target.getLeafId();
  lines.push({
    type: "custom",
    customType: LEAF_ENTRY_TYPE,
    data: { reason: "graft" },
    id: shortId(),
    parentId: leafId,
    timestamp: new Date().toISOString(),
  } as unknown as Raw);
  appendFileSync(targetFile, `${lines.map(line => JSON.stringify(line)).join("\n")}\n`);
  return { kind: "merged", grafted: lines.length - 1 };
}
