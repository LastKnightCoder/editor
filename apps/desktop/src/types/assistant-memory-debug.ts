import type { AssistantMemory, MemorySource, PersonalMemoryModel } from "./assistant-memory";

export type MemoryDebugPhase =
  | "idle"
  | "scanning"
  | "reading"
  | "extracting"
  | "reflecting"
  | "reviewing";
export type MemoryDebugSource = MemorySource & { title?: string };
export interface MemoryDebugEvent {
  at: number;
  area: "worker" | "vectors" | "system";
  level: "info" | "error";
  message: string;
  source?: MemoryDebugSource;
}
export type MemoryDebugReporter = (event: MemoryDebugEvent, contentChanged?: boolean) => void;

export interface MemoryWorkerDebug {
  phase: MemoryDebugPhase;
  startedAt: number | null;
  sources: MemoryDebugSource[];
  scanning: boolean;
  running: boolean;
  nextSourceAt: number | null;
  nextReflectionAt: number | null;
  nextReviewAt: number | null;
  lastReflectionAt: number | null;
  lastReviewAt: number | null;
  reviewCursor: number | null;
}
export interface MemoryVectorDebug {
  configured: boolean;
  model: string | null;
  ready: boolean;
  running: boolean;
  startedAt: number | null;
  retryAt: number | null;
  failures: number;
}
export type MemoryDebugModel = PersonalMemoryModel & { updatedAt: number };
export type MemoryDebugEpisode = Omit<AssistantMemory, "evidence"> & {
  updatedAt: number;
  evidenceCount: number;
  sourceKinds: MemorySource["kind"][];
};
export interface MemoryDebugData {
  counts: {
    episodes: number;
    excluded: number;
    profile: number;
    state: number;
    indexed: number;
    pendingVectors: number;
  };
  progress: { checked: number; pending: number; failed: number };
  profile: MemoryDebugModel[];
  recent: MemoryDebugModel[];
  episodes: MemoryDebugEpisode[];
  limit: number;
}
export interface MemoryDebugSnapshot {
  databaseName: string;
  connectionId: string;
  revision: number;
  contentRevision: number;
  capturedAt: number;
  configured: boolean;
  blockingReason: "unconfigured" | "foreground" | "sync" | null;
  worker: MemoryWorkerDebug;
  vectors: MemoryVectorDebug;
  data: MemoryDebugData;
  events: MemoryDebugEvent[];
}
export interface MemoryDebugPush {
  subscriptionId: string;
  databaseName: string;
  connectionId: string;
  snapshot: MemoryDebugSnapshot | null;
}
export interface MemoryDebugDetail {
  model?: PersonalMemoryModel;
  episodes: Array<
    Omit<AssistantMemory, "evidence"> & {
      evidence: Array<AssistantMemory["evidence"][number] & { available: boolean }>;
    }
  >;
}
