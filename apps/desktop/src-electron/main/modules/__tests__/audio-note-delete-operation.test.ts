import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/editor-test",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock("../video-note-index-queue", () => ({
  default: {
    enqueueTask: vi.fn(),
    cleanupVideoNoteArtifacts: vi.fn(),
  },
}));

import AudioNoteTable from "../tables/audio-note";
import AudioNoteItemTable from "../tables/audio-note-item";
import AudioNoteChatTable from "../tables/audio-note-chat";
import Operation from "../tables/operation";

describe("AudioNoteTable.deleteAudioNote operation log", () => {
  it("删除不存在的音频笔记时不写入删除操作记录", () => {
    vi.spyOn(AudioNoteItemTable, "removeByAudioNoteId").mockReturnValue(0);
    vi.spyOn(AudioNoteChatTable, "deleteChatsByAudioNoteId").mockReturnValue(0);
    const insertOperation = vi
      .spyOn(Operation, "insertOperation")
      .mockImplementation(() => undefined as any);
    const db = {
      transaction: (fn: () => unknown) => fn,
      prepare: vi.fn(() => ({
        run: vi.fn(() => ({ changes: 0 })),
      })),
      name: "test.db",
    } as any;

    expect(AudioNoteTable.deleteAudioNote(db, 404)).toBe(0);
    expect(insertOperation).not.toHaveBeenCalled();
  });
});
