import { beforeEach, describe, expect, it, vi } from "vitest";
import * as tauri from "../../../../services/tauri";
import type { DiaryEntry } from "../../../../types";
import { useDiaryStore } from "../useDiaryStore";
import { getQueryClient } from "../../../../router";

vi.mock("../../../../services/tauri", () => ({
  diaryListEntries: vi.fn(),
  diaryUpsertEntry: vi.fn(),
  diaryDeleteSegment: vi.fn(),
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
    segments: params.segments ?? [],
    tags: params.tags ?? [],
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
      currentEntry: null,
      lastFailedContent: null,
      activeSegmentId: null,
      lastFailedTarget: null,
    },
    false
  );
}

describe("diary/useDiaryStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDiaryStore();
    getQueryClient().clear();
  });

  it("initialize 在无当前日记时应自动创建空白日记", async () => {
    vi.mocked(tauri.diaryListEntries).mockResolvedValue([]);
    vi.mocked(tauri.diaryUpsertEntry).mockResolvedValue(
      makeDiaryEntry({
        id: 11,
        type: "daily",
        date: "2026-02-22",
      })
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
        currentEntry: makeDiaryEntry({
          id: 1,
          date: "2026-02-21",
        }),
      },
      false
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
    expect(getQueryClient().getQueryData(["diary", "entries"])).toHaveLength(1);
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
        currentEntry: existing,
      },
      false
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
        currentEntry: existing,
      },
      false
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
        })
      );

    await expect(
      useDiaryStore.getState().saveCurrentContent([
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "失败内容" }],
        },
      ])
    ).rejects.toThrow();

    expect(useDiaryStore.getState().error).toContain("自动保存失败");
    expect(useDiaryStore.getState().lastFailedContent).not.toBeNull();

    const retryOk = await useDiaryStore.getState().retryLastFailed();
    expect(retryOk).toBe(true);
    expect(useDiaryStore.getState().error).toBe("");
    expect(useDiaryStore.getState().lastFailedContent).toBeNull();
  });

  it("保存时发送选中片段 ID，并保留其他片段", async () => {
    const entry = makeDiaryEntry({
      segments: [
        {
          id: 11,
          diaryId: 1,
          contentId: 101,
          content: [],
          wordCount: 0,
          createTime: 1,
          updateTime: 1,
        },
        {
          id: 12,
          diaryId: 1,
          contentId: 102,
          content: [],
          wordCount: 0,
          createTime: 2,
          updateTime: 2,
        },
      ],
    });
    getQueryClient().setQueryData(["diary", "entries"], [entry]);
    useDiaryStore.setState({
      currentEntry: entry,
      activeSegmentId: 12,
    });
    vi.mocked(tauri.diaryUpsertEntry).mockResolvedValue(entry);
    await useDiaryStore.getState().saveCurrentContent(entry.content);
    expect(tauri.diaryUpsertEntry).toHaveBeenCalledWith(expect.objectContaining({ segmentId: 12 }));
    expect(useDiaryStore.getState().currentEntry?.segments).toHaveLength(2);
  });

  it("切换片段后不会把失败草稿重试到另一个片段", async () => {
    const entry = makeDiaryEntry({
      segments: [
        {
          id: 11,
          diaryId: 1,
          contentId: 101,
          content: [],
          wordCount: 0,
          createTime: 1,
          updateTime: 1,
        },
        {
          id: 12,
          diaryId: 1,
          contentId: 102,
          content: [],
          wordCount: 0,
          createTime: 2,
          updateTime: 2,
        },
      ],
    });
    getQueryClient().setQueryData(["diary", "entries"], [entry]);
    useDiaryStore.setState({
      currentEntry: entry,
      activeSegmentId: 11,
    });
    vi.mocked(tauri.diaryUpsertEntry).mockRejectedValue(new Error("offline"));
    await expect(useDiaryStore.getState().saveCurrentContent(entry.content)).rejects.toThrow();
    useDiaryStore.getState().selectSegment(12);
    expect(await useDiaryStore.getState().retryLastFailed()).toBe(false);
    expect(tauri.diaryUpsertEntry).toHaveBeenCalledTimes(1);
  });

  it("追加片段使用独立入口，删除后选中剩余片段", async () => {
    const first = {
      id: 11,
      diaryId: 1,
      contentId: 101,
      content: [],
      wordCount: 0,
      createTime: 1,
      updateTime: 1,
    };
    const second = { ...first, id: 12, contentId: 102 };
    const entry = makeDiaryEntry({ segments: [first] });
    getQueryClient().setQueryData(["diary", "entries"], [entry]);
    useDiaryStore.setState({ currentEntry: entry });
    vi.mocked(tauri.diaryUpsertEntry).mockResolvedValue({
      ...entry,
      segments: [first, second],
    });
    await useDiaryStore.getState().appendSegment();
    expect(tauri.diaryUpsertEntry).toHaveBeenCalledWith(
      expect.objectContaining({ newSegment: true })
    );
    expect(useDiaryStore.getState().activeSegmentId).toBe(12);
    vi.mocked(tauri.diaryDeleteSegment).mockResolvedValue(entry);
    await useDiaryStore.getState().deleteCurrentSegment();
    expect(tauri.diaryDeleteSegment).toHaveBeenCalledWith(1, 12);
    expect(useDiaryStore.getState().activeSegmentId).toBe(11);
  });
});
