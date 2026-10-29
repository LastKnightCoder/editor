import { AiError } from "../contracts";
import {
  SESSION_FORMAT_VERSION,
  isRecord,
  type SessionDocument,
  type SessionEntry,
  type SessionHeader,
} from "./types";

const invalid = (message: string, line?: number): never => {
  throw new AiError("AI_SESSION_INVALID", message, false, line ? { line } : undefined);
};

const validIdentity = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);

function readHeader(value: unknown): SessionHeader {
  if (!isRecord(value)) return invalid("会话文件头不是对象");
  if (value.type !== "session" || value.version !== SESSION_FORMAT_VERSION)
    throw new AiError("AI_SESSION_FORMAT_UNSUPPORTED", "只支持 pi 会话格式 v3", false, {
      version: value.version ?? value.v ?? null,
    });
  if (
    !validIdentity(value.id) ||
    typeof value.timestamp !== "string" ||
    !Number.isFinite(Date.parse(value.timestamp)) ||
    typeof value.cwd !== "string"
  )
    return invalid("会话文件头缺少有效身份、时间或来源目录");
  return value as SessionHeader;
}

function readEntry(value: unknown, line: number, ids: Set<string>): SessionEntry {
  if (
    !isRecord(value) ||
    typeof value.type !== "string" ||
    !validIdentity(value.id) ||
    !(value.parentId === null || typeof value.parentId === "string") ||
    typeof value.timestamp !== "string" ||
    !Number.isFinite(Date.parse(value.timestamp))
  )
    return invalid("会话记录缺少有效类型、身份、父节点或时间", line);
  if (ids.has(value.id)) return invalid("会话记录 ID 重复", line);
  if (value.parentId !== null && !ids.has(value.parentId))
    return invalid("会话记录的父节点不存在或位于子节点之后", line);
  if (
    value.type === "message" &&
    (!isRecord(value.message) || typeof value.message.role !== "string")
  )
    return invalid("消息记录没有有效角色", line);
  if (
    value.type === "context_edit" &&
    (typeof value.targetId !== "string" ||
      !ids.has(value.targetId) ||
      !(
        value.replacement === null ||
        (isRecord(value.replacement) && "content" in value.replacement)
      ))
  )
    return invalid("上下文修改记录的目标或替换内容无效", line);
  if (
    value.type === "compaction" &&
    (typeof value.summary !== "string" ||
      !(value.firstKeptEntryId === null || typeof value.firstKeptEntryId === "string") ||
      typeof value.tokensBefore !== "number" ||
      !Number.isFinite(value.tokensBefore) ||
      (value.systemMessage !== undefined &&
        (!isRecord(value.systemMessage) || value.systemMessage.role !== "system")))
  )
    return invalid("压缩记录缺少摘要、保留边界或系统快照", line);
  if (
    value.type === "branch_summary" &&
    (typeof value.summary !== "string" || typeof value.fromId !== "string")
  )
    return invalid("分支摘要记录无效", line);
  if (
    (value.type === "custom" || value.type === "custom_message") &&
    typeof value.customType !== "string"
  )
    return invalid("自定义记录缺少类型", line);
  if (
    value.type === "model_change" &&
    (typeof value.provider !== "string" || typeof value.modelId !== "string")
  )
    return invalid("模型变更记录无效", line);
  if (value.type === "thinking_level_change" && typeof value.thinkingLevel !== "string")
    return invalid("思考档位记录无效", line);
  ids.add(value.id);
  return value as unknown as SessionEntry;
}

export function parseSessionFile(text: string): SessionDocument {
  const lines = text.split("\n");
  const document: SessionDocument = {
    header: undefined as unknown as SessionHeader,
    entries: [],
    diagnostics: [],
  };
  const ids = new Set<string>();
  let byteOffset = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const isTail = index === lines.length - 1 && !text.endsWith("\n");
    if (line.trim()) {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        if (!document.header || !isTail)
          return invalid("会话文件存在无法解析的完整记录", index + 1);
        document.diagnostics.push({
          code: "incomplete-tail",
          line: index + 1,
          byteOffset,
          raw: line,
        });
        break;
      }
      if (!document.header) document.header = readHeader(value);
      else document.entries.push(readEntry(value, index + 1, ids));
    }
    byteOffset += new TextEncoder().encode(
      line + (index < lines.length - 1 ? "\n" : "")
    ).byteLength;
  }
  if (!document.header) return invalid("会话文件为空");
  return document;
}

export function serializeSessionFile(document: SessionDocument): string {
  if (document.diagnostics.length)
    return invalid("会话末尾有未完成记录，必须先备份并显式恢复，不能静默丢弃");
  const text =
    [document.header, ...document.entries].map(entry => JSON.stringify(entry)).join("\n") + "\n";
  parseSessionFile(text);
  return text;
}

export function createSessionFile(options: {
  id: string;
  cwd?: string;
  timestamp?: string;
}): SessionDocument {
  return parseSessionFile(
    JSON.stringify({
      type: "session",
      version: SESSION_FORMAT_VERSION,
      id: options.id,
      timestamp: options.timestamp ?? new Date().toISOString(),
      cwd: options.cwd ?? "",
    }) + "\n"
  );
}
