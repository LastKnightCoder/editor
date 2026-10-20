import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

// 切断 tables → database 模块的循环依赖链
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import { markIndexed, type MainContentIndexStats } from "../main-content-vec-index-queue";

const counts = (indexed: number, outdated: number, unindexed: number) => ({
  total: indexed + outdated + unindexed,
  indexed,
  outdated,
  unindexed,
});

const sample = (): MainContentIndexStats => ({
  ...counts(1, 1, 2),
  byType: {
    card: counts(1, 1, 1),
    article: counts(0, 0, 1),
    "project-item": counts(0, 0, 0),
    "diary-moment": counts(0, 0, 0),
    "plugin-entity": counts(0, 0, 0),
    excerpt: counts(0, 0, 0),
    "pdf-annotation": counts(0, 0, 0),
    "web-clip": counts(0, 0, 0),
  },
});

describe("索引进行中的覆盖率增量", () => {
  it("从未索引挪到已索引，总数与分项同步", () => {
    const stats = sample();
    markIndexed(stats, "article", false);
    expect(stats).toMatchObject({ indexed: 2, unindexed: 1 });
    expect(stats.byType.article).toMatchObject({ indexed: 1, unindexed: 0, total: 1 });
  });

  it("索引过的（待更新）从待更新挪走", () => {
    const stats = sample();
    markIndexed(stats, "card", true);
    expect(stats).toMatchObject({ indexed: 2, outdated: 0 });
    expect(stats.byType.card).toMatchObject({ indexed: 2, outdated: 0, unindexed: 1 });
  });

  it("计数不会减成负数", () => {
    const stats = sample();
    markIndexed(stats, "project-item", false);
    expect(stats.byType["project-item"]).toMatchObject({ indexed: 0, unindexed: 0 });
    expect(stats).toMatchObject({ indexed: 2, unindexed: 1 });
  });
});
