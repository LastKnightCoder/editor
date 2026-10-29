import type { MessageContent } from "@tau/shared/chat-core";
import { AiError } from "../contracts";
import {
  DISPLAY_ENTRY_TYPE,
  LEAF_ENTRY_TYPE,
  isRecord,
  type PiTranscriptEntry,
  type SessionDocument,
  type SessionEdit,
  type SessionEntry,
  type SessionEntryInput,
} from "./types";
import { parseSessionFile, serializeSessionFile } from "./codec";

export function getSessionBranch(
  document: Pick<SessionDocument, "entries">,
  leafId?: string | null
): SessionEntry[] {
  if (leafId === null) return [];
  const byId = new Map(document.entries.map(entry => [entry.id, entry]));
  let entry = leafId === undefined ? document.entries.at(-1) : byId.get(leafId);
  if (leafId !== undefined && !entry) throw new AiError("AI_SESSION_INVALID", "会话叶子不存在");
  const path: SessionEntry[] = [];
  const seen = new Set<string>();
  while (entry) {
    if (seen.has(entry.id)) throw new AiError("AI_SESSION_INVALID", "会话树存在循环");
    seen.add(entry.id);
    path.push(entry);
    entry = entry.parentId === null ? undefined : byId.get(entry.parentId);
  }
  return path.reverse();
}

const isConversation = (entry: SessionEntry) =>
  entry.type === "message" && entry.message?.role !== "system";

export function getMessageVersions(entries: readonly SessionEntry[]) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const groups = new Map<string | null, string[]>();
  const anchors = new Map<string, string | null>();
  const anchorOf = (entry: SessionEntry) => {
    if (anchors.has(entry.id)) return anchors.get(entry.id) ?? null;
    let parent = entry.parentId === null ? undefined : byId.get(entry.parentId);
    const walked = [entry.id];
    let anchor: string | null = null;
    while (parent) {
      if (isConversation(parent)) {
        anchor = parent.id;
        break;
      }
      if (anchors.has(parent.id)) {
        anchor = anchors.get(parent.id) ?? null;
        break;
      }
      walked.push(parent.id);
      parent = parent.parentId === null ? undefined : byId.get(parent.parentId);
    }
    for (const id of walked) anchors.set(id, anchor);
    return anchor;
  };
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message?.role !== "user") continue;
    const key = anchorOf(entry);
    const group = groups.get(key) ?? [];
    group.push(entry.id);
    groups.set(key, group);
  }
  const versions = new Map<string, { ids: string[]; index: number }>();
  for (const ids of groups.values())
    if (ids.length > 1) ids.forEach((id, index) => versions.set(id, { ids, index }));
  return versions;
}

const userText = (content: unknown) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter(isRecord)
          .filter(block => block.type === "text")
          .map(block => (typeof block.text === "string" ? block.text : ""))
          .join("")
      : "";

/** 完整展示路径保留压缩前消息，只应用当前分支的最后一次内容修改。 */
export function getSessionTranscript(
  document: Pick<SessionDocument, "entries">,
  leafId?: string | null
): PiTranscriptEntry[] {
  const branch = getSessionBranch(document, leafId);
  const versions = getMessageVersions(document.entries);
  const edits = new Map<string, unknown>();
  for (const entry of branch)
    if (entry.type === "context_edit") edits.set(String(entry.targetId), entry.replacement);
  const pendingUsers: PiTranscriptEntry[] = [];
  const out: PiTranscriptEntry[] = [];
  for (const entry of branch) {
    if (entry.type === "message" && entry.message) {
      const edit = edits.get(entry.id);
      if (edit === null) continue;
      const message = { ...entry.message };
      if (isRecord(edit) && "content" in edit) {
        const content = edit.content;
        message.content =
          (message.role === "assistant" || message.role === "toolResult") &&
          typeof content === "string"
            ? [{ type: "text", text: content }]
            : content;
      }
      if (message.timestamp === undefined) message.timestamp = Date.parse(entry.timestamp);
      const item: PiTranscriptEntry = {
        id: entry.id,
        message,
        ...(versions.has(entry.id) ? { versions: versions.get(entry.id) } : {}),
      };
      out.push(item);
      if (message.role === "user") pendingUsers.push(item);
    } else if (
      entry.type === "custom" &&
      entry.customType === DISPLAY_ENTRY_TYPE &&
      isRecord(entry.data)
    ) {
      const data = entry.data;
      if (!Array.isArray(data.content) || typeof data.modelText !== "string") continue;
      const index = pendingUsers.findIndex(
        user => userText(user.message.content) === data.modelText
      );
      if (index < 0) continue;
      const [user] = pendingUsers.splice(index, 1);
      user.display = {
        content: structuredClone(data.content) as MessageContent[],
        ...(typeof data.clientId === "string" ? { clientId: data.clientId } : {}),
      };
    }
  }
  return out;
}

export function appendSessionEntries(
  document: SessionDocument,
  inputs: readonly SessionEntryInput[],
  options: { parentId?: string | null; now?: string; createId?: () => string } = {}
): SessionDocument {
  if (document.diagnostics.length)
    throw new AiError("AI_SESSION_INVALID", "存在未完成记录，不能继续追加");
  let parentId =
    options.parentId === undefined ? (document.entries.at(-1)?.id ?? null) : options.parentId;
  const timestamp = options.now ?? new Date().toISOString();
  const entries = inputs.map(input => {
    const entry: SessionEntry = {
      ...input,
      id: input.id ?? options.createId?.() ?? crypto.randomUUID(),
      parentId,
      timestamp: input.timestamp ?? timestamp,
    };
    parentId = entry.id;
    return entry;
  });
  return parseSessionFile(
    serializeSessionFile({ ...document, entries: [...document.entries, ...entries] })
  );
}

export function applySessionEdit(
  document: SessionDocument,
  edit: SessionEdit,
  options: { now?: string; createId?: () => string } = {}
): SessionDocument {
  const branch = getSessionBranch(document);
  if (edit.kind === "omit") {
    const ids = new Set(branch.map(entry => entry.id));
    if (edit.entryIds.some(id => !ids.has(id)))
      throw new AiError("AI_SESSION_INVALID", "待删除消息不在当前分支");
    return appendSessionEntries(
      document,
      edit.entryIds.map(targetId => ({ type: "context_edit", targetId, replacement: null })),
      options
    );
  }
  const target = document.entries.find(entry => entry.id === edit.entryId);
  if (!target || (edit.kind !== "switch" && !branch.some(entry => entry.id === target.id)))
    throw new AiError("AI_SESSION_INVALID", "历史操作的目标不存在或不在当前分支");
  let parentId = edit.kind === "rewind" ? target.parentId : target.id;
  if (edit.kind === "switch") {
    const descendants = new Set([target.id]);
    for (const entry of document.entries)
      if (entry.parentId && descendants.has(entry.parentId)) {
        descendants.add(entry.id);
        parentId = entry.id;
      }
  }
  const nextPath = getSessionBranch(document, parentId);
  const onPath = new Set(nextPath.map(entry => entry.id));
  const omitted = new Set(
    nextPath
      .filter(entry => entry.type === "context_edit" && entry.replacement === null)
      .map(entry => String(entry.targetId))
  );
  const reapply = branch
    .filter(entry => entry.type === "context_edit" && entry.replacement === null)
    .map(entry => String(entry.targetId))
    .filter(id => onPath.has(id) && !omitted.has(id));
  return appendSessionEntries(
    document,
    [
      ...[...new Set(reapply)].map(targetId => ({
        type: "context_edit",
        targetId,
        replacement: null,
      })),
      { type: "custom", customType: LEAF_ENTRY_TYPE, data: { reason: edit.kind } },
    ],
    { ...options, parentId }
  );
}
