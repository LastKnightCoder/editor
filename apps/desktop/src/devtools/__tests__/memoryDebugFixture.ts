import type { MemoryDebugSnapshot } from "@/types/assistant-memory-debug";

export function memoryDebugFixture(revision = 1): MemoryDebugSnapshot {
  const at = Date.UTC(2026, 10, 6, 12) + revision;
  return {
    databaseName: "data.db",
    connectionId: "connection-a",
    revision,
    contentRevision: revision,
    capturedAt: at,
    configured: true,
    blockingReason: null,
    worker: {
      phase: "idle",
      startedAt: null,
      sources: [],
      scanning: false,
      running: false,
      nextSourceAt: null,
      nextReflectionAt: null,
      nextReviewAt: null,
      lastReflectionAt: null,
      lastReviewAt: null,
      reviewCursor: null,
    },
    vectors: {
      configured: false,
      model: null,
      ready: false,
      running: false,
      startedAt: null,
      retryAt: null,
      failures: 0,
    },
    data: {
      counts: { episodes: 1, excluded: 0, profile: 0, state: 1, indexed: 0, pendingVectors: 1 },
      progress: { checked: 1, pending: 0, failed: 0 },
      limit: 40,
      profile: [],
      portrait: [],
      episodes: [],
      recent: [
        {
          id: 1,
          layer: "state",
          kind: "intention",
          topic: "调试目标",
          text: `个人状态版本 ${revision}`,
          confidence: "explicit",
          observedAt: at,
          expiresAt: null,
          updatedAt: at,
          episodeIds: [1],
        },
      ],
    },
    events: [],
  };
}
