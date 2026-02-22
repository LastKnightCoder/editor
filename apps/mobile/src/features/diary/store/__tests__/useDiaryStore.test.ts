import { beforeEach, describe, expect, it, vi } from "vitest";
import * as tauri from "../../../../services/tauri";
import type { DiaryEntry } from "../../../../types";
import { useDiaryStore } from "../useDiaryStore";

vi.mock("../../../../services/tauri", () => ({
  diaryListEntries: vi.fn(),
  diaryUpsertEntry: vi.fn(),
}));

function makeDiaryEntry(params: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: params.id ?? 1,
    type: params.type ?? "daily",
    date: params.date ?? "2026-02-22",
    contentId: params.contentId ?? 1001,
    weather: params.weather ?? null,
    mood: params.mood ?? null,
    wordCount: params.wordCount ?? 0,
    createTime: params.createTime ?? 1,
    updateTime: params.updateTime ?? 1,
    content: params.content ?? [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ],
  };
}

function resetDiaryStore() {
  useDiaryStore.setState(
    {
      initialized: false,
      loading: false,
      saving: false,
      error: "",
      lastSavedAt: null,
      mode: "daily",
      baseDate: "2026-02-22",
      entries: [],
      currentEntry: null,
      lastFailedContent: null,
    },
    false,
  );
}

describe("diary/useDiaryStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDiaryStore();
  });

  it("initialize 在无当前日记时应自动创建空白日记", async () => {
    vi.mocked(tauri.diaryListEntries).mockResolvedValue([]);
    vi.mocked(tauri.diaryUpsertEntry).mockResolvedValue(
      makeDiaryEntry({
        id: 11,
        type: "daily",
        date: "2026-02-22",
      }),
    );

    await useDiaryStore.getState().initialize();

    const state = useDiaryStore.getState();
    expect(tauri.diaryListEntries).toHaveBeenCalledTimes(1);
    expect(tauri.diaryUpsertEntry).toHaveBeenCalledTimes(1);
    expect(state.currentEntry?.id).toBe(11);
    expect(state.initialized).toBe(true);
  });

  it("reloadAfterDatabaseChange 应重建当前态且不触发自动写入", async () => {
    useDiaryStore.setState(
      {
        initialized: true,
        mode: "daily",
        baseDate: "2026-02-22",
        entries: [
          makeDiaryEntry({
            id: 1,
            date: "2026-02-21",
          }),
        ],
        currentEntry: makeDiaryEntry({
          id: 1,
          date: "2026-02-21",
        }),
      },
      false,
    );
    vi.mocked(tauri.diaryListEntries).mockResolvedValue([
      makeDiaryEntry({
        id: 77,
        date: "2026-02-22",
        updateTime: 7,
      }),
    ]);

    await useDiaryStore.getState().reloadAfterDatabaseChange("data.db");

    const state = useDiaryStore.getState();
    expect(tauri.diaryListEntries).toHaveBeenCalledTimes(1);
    expect(state.entries).toHaveLength(1);
    expect(state.currentEntry?.id).toBe(77);
    expect(state.error).toBe("");
    expect(tauri.diaryUpsertEntry).not.toHaveBeenCalled();
  });

  it("saveCurrentContent 应写入当前日记并更新 lastSavedAt（用于节流/flush 后落库）", async () => {
    const existing = makeDiaryEntry({
      id: 21,
      date: "2026-02-22",
      content: [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "旧内容" }],
        },
      ],
    });
    useDiaryStore.setState(
      {
        initialized: true,
        entries: [existing],
        currentEntry: existing,
      },
      false,
    );

    const updated = makeDiaryEntry({
      ...existing,
      updateTime: 2,
      wordCount: 4,
      content: [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "新内容" }],
        },
      ],
    });
    vi.mocked(tauri.diaryUpsertEntry).mockResolvedValue(updated);

    await useDiaryStore.getState().saveCurrentContent(updated.content);

    const state = useDiaryStore.getState();
    expect(tauri.diaryUpsertEntry).toHaveBeenCalledTimes(1);
    expect(state.currentEntry?.wordCount).toBe(4);
    expect(state.lastSavedAt).not.toBeNull();
  });

  it("saveCurrentContent 失败后应记录错误，并可通过 retryLastFailed 重试", async () => {
    const existing = makeDiaryEntry({
      id: 31,
      date: "2026-02-22",
    });
    useDiaryStore.setState(
      {
        initialized: true,
        entries: [existing],
        currentEntry: existing,
      },
      false,
    );

    vi.mocked(tauri.diaryUpsertEntry)
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce(
        makeDiaryEntry({
          ...existing,
          updateTime: 3,
          wordCount: 6,
          content: [
            {
              type: "paragraph",
              children: [{ type: "formatted", text: "重试成功内容" }],
            },
          ],
        }),
      );

    await expect(
      useDiaryStore.getState().saveCurrentContent([
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "失败内容" }],
        },
      ]),
    ).rejects.toThrow();

    expect(useDiaryStore.getState().error).toContain("自动保存失败");
    expect(useDiaryStore.getState().lastFailedContent).not.toBeNull();

    const retryOk = await useDiaryStore.getState().retryLastFailed();
    expect(retryOk).toBe(true);
    expect(useDiaryStore.getState().error).toBe("");
    expect(useDiaryStore.getState().lastFailedContent).toBeNull();
  });
});
