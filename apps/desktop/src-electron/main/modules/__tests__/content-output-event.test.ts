import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../video-note-index-queue", () => ({
  default: {
    enqueueTask: vi.fn(),
    cleanupVideoNoteArtifacts: vi.fn(),
  },
}));

import { findOutputSubjectsForContent } from "../tables/content";

describe("ContentTable output events", () => {
  it("能根据文章正文 contentId 找到文章输出归属", () => {
    const db = {
      prepare: vi.fn((sql: string) => ({
        all: vi.fn((contentId: number) => {
          if (sql.includes("FROM articles")) {
            return [{ subjectType: "article", subjectId: 1, contentId }];
          }
          return [];
        }),
      })),
    } as any;

    expect(findOutputSubjectsForContent(db, 42)).toEqual([
      { subjectType: "article", subjectId: 1, contentId: 42 },
    ]);
  });
});
