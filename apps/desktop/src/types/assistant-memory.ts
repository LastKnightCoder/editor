import type { EntityRef } from "@/entity/ref";

export const MEMORY_KINDS = ["event", "fact", "preference", "routine", "intention"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemoryState = "current" | "history" | "observation";
export const MEMORY_SOURCE_KINDS = ["todo", "calendar", "content", "chat"] as const;
export type MemorySourceKind = (typeof MEMORY_SOURCE_KINDS)[number];
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
  evidence: MemoryEvidence[];
}

export interface MemorySearch {
  query?: string;
  kind?: MemoryKind;
  state?: MemoryState | "all";
  from?: number;
  to?: number;
  limit?: number;
  before?: number;
}

export interface MemorySearchResult {
  memories: AssistantMemory[];
  sources: MemoryEvidence[];
  nextBefore: number | null;
}

export interface AssistantMemoryStatus {
  configured: boolean;
  running: boolean;
  scanning: boolean;
  checked: number;
  pending: number;
  failed: number;
  lastDreamAt: number | null;
}

export type MemoryCorrection = Pick<AssistantMemory, "kind" | "topic" | "text" | "state">;
