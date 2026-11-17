import type { MessageContent } from "@tau/shared/chat-core";
import type {
  CompactionEntry as SdkCompactionEntry,
  SessionEntry as SdkSessionEntry,
  SessionEntryBase,
} from "@earendil-works/pi-coding-agent";

export const SESSION_FORMAT_VERSION = 3;
export const DISPLAY_ENTRY_TYPE = "desktop-display";
export const LEAF_ENTRY_TYPE = "desktop-leaf";

export interface SessionHeader {
  type: "session";
  version: typeof SESSION_FORMAT_VERSION;
  id: string;
  timestamp: string;
  cwd: string;
  [key: string]: unknown;
}

export interface PiTranscriptMessage {
  role?: string;
  content?: unknown;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  details?: unknown;
  timestamp?: number;
  provider?: string;
  model?: string;
  usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
  [key: string]: unknown;
}

/** 官方 message entry 的视图：结构字段同 SDK，载荷以 PiTranscriptMessage 消费 */
export interface SessionMessageEntryView extends SessionEntryBase {
  type: "message";
  message: PiTranscriptMessage;
  [key: string]: unknown;
}

/**
 * compaction 边界：SDK d.ts 声明 string，但其 appendCompaction API 与实际文件都写 null
 * （压缩到文件头时无保留起点），按运行时事实放宽。
 */
type CompactionEntryView = Omit<SdkCompactionEntry, "firstKeptEntryId"> & {
  firstKeptEntryId: string | null;
} & { [key: string]: unknown };

/** message 载荷换成本包视图，compaction 边界按运行时事实放宽，其余官方 entry 原样继承 */
type SdkEntryView<T> = T extends { type: "message" }
  ? SessionMessageEntryView
  : T extends { type: "compaction" }
    ? CompactionEntryView
    : T & { [key: string]: unknown };

/**
 * 未知 entry（桌面扩展 customType、未来 SDK 新种类）：宽容保留用于展示，
 * 进模型上下文由 buildSessionContext 按已知种类白名单拒绝。
 */
export interface UnknownSessionEntry {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  message?: PiTranscriptMessage;
  [key: string]: unknown;
}

/** 会话文档 entry：官方种类继承 SDK 定义（SDK 增删 entry 种类时此处随之编译期变化）＋未知宽容形状 */
export type SessionEntry = SdkEntryView<SdkSessionEntry> | UnknownSessionEntry;

export interface SessionDiagnostic {
  code: "incomplete-tail";
  line: number;
  byteOffset: number;
  raw: string;
}

export interface SessionDocument {
  header: SessionHeader;
  entries: SessionEntry[];
  diagnostics: SessionDiagnostic[];
}

export interface PiTranscriptEntry {
  id: string;
  message: PiTranscriptMessage;
  display?: { content: MessageContent[]; clientId?: string };
  versions?: { ids: string[]; index: number };
}

export interface SessionContext {
  messages: PiTranscriptMessage[];
  thinkingLevel: string;
  model: { provider: string; modelId: string } | null;
}

export type SessionEdit =
  | { kind: "rewind"; entryId: string }
  | { kind: "fork"; entryId: string }
  | { kind: "switch"; entryId: string }
  | { kind: "omit"; entryIds: string[] };

export interface SessionEntryInput {
  type: string;
  id?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
