import type { EntityRef } from "@/entity/ref";

export const MEMORY_KINDS = [
  "event",
  "fact",
  "preference",
  "routine",
  "intention",
  "interest",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemoryState = "current" | "history" | "observation";
/** 意图与遗留事项的结局：本人自述完成、放弃，或到期未跟进。 */
export type MemoryOutcome = "done" | "dropped" | "expired";
export const MEMORY_SOURCE_KINDS = [
  "todo",
  "calendar",
  "content",
  "chat",
  "activity",
  "diary",
] as const;
export type MemorySourceKind = (typeof MEMORY_SOURCE_KINDS)[number];
export const MEMORY_INGEST_KINDS = ["todo", "calendar", "chat", "activity", "diary"] as const;
export type MemoryLayer = "overview" | "episode" | "state" | "profile";
export interface MemorySource {
  kind: MemorySourceKind;
  id: string;
}

export interface MemoryEvidence extends MemorySource {
  anchor: string;
  quote: string;
  title?: string;
  target?: EntityRef;
  block?: number;
  messageId?: string;
  current?: string;
  observedAt?: number;
}

export interface AssistantMemory {
  id: number;
  kind: MemoryKind;
  topic: string;
  text: string;
  state: MemoryState;
  observedAt: number;
  expiresAt: number | null;
  manual: boolean;
  outcome?: MemoryOutcome | null;
  /** 提炼时被判定为稳定的本人表达，已升格为明确画像。 */
  stable?: boolean;
  evidence: MemoryEvidence[];
}

export interface MemorySearch {
  layer?: MemoryLayer | "all";
  query?: string;
  kind?: MemoryKind;
  state?: MemoryState | "all";
  from?: number;
  to?: number;
  limit?: number;
  before?: number;
}

export interface MemorySearchResult {
  models: PersonalMemoryModel[];
  episodeHints?: Pick<AssistantMemory, "id" | "kind" | "topic" | "observedAt">[];
  memories: AssistantMemory[];
  sources: MemoryEvidence[];
  nextBefore: number | null;
}

export interface PersonalMemoryModel {
  id: number;
  layer: "state" | "profile";
  kind: MemoryKind;
  topic: string;
  text: string;
  confidence: "explicit" | "supported" | "observation";
  observedAt: number;
  expiresAt: number | null;
  episodeIds: number[];
}

export type MemoryCorrection = Pick<AssistantMemory, "kind" | "topic" | "text" | "state">;

/** 用户总述：每行引用支撑它的模型 ID，依据变化后该行隐藏直到重建。 */
export interface MemoryPortrait {
  lines: { text: string; modelIds: number[] }[];
  generatedAt: number;
}
