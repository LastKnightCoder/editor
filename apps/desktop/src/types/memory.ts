export type MemorySourceType = "chat" | "diary";

export type MemoryCheckpointState =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "stale";

export type MemoryJobStatus =
  | "pending"
  | "running"
  | "interrupted"
  | "completed"
  | "failed"
  | "cancelled";

export interface MemorySearchHit {
  text: string;
  similarity: number;
  room: string;
  wing: string;
  sourceType: MemorySourceType;
  sourceId: number;
  sourceVersion?: number | null;
  chunkIndex?: number | null;
  date?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MemoryStatusSummary {
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  stale: number;
}

export interface MemoryStatus {
  available: boolean;
  mainDbName: string;
  rootDir: string;
  palacePath: string;
  stateDbPath: string;
  summaries: Record<MemorySourceType, MemoryStatusSummary>;
  runningJobs: number;
  interruptedJobs: number;
}

export interface MemoryCheckpointRecord {
  sourceType: MemorySourceType;
  sourceId: number;
  sourceVersion: number;
  archiveHash: string;
  archiveState: MemoryCheckpointState;
  lastArchivedAt?: number | null;
  lastError?: string | null;
}

export interface MemorySearchParams {
  query: string;
  sourceTypes?: MemorySourceType[];
  limit?: number;
  room?: string;
}

export interface MemorySourceContextParams {
  sourceType: MemorySourceType;
  sourceId: number;
}

export interface DeleteWithMemoryResult {
  deletedCount: number;
  mainDeleteSucceeded: boolean;
  memoryCleanupSucceeded: boolean;
  memoryCleanupError?: string | null;
}
