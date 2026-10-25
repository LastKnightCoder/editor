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
      error: "",
      mode: "daily",
      baseDate: "2026-02-22",
      currentEntry: null,
      activeSegmentId: null,
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

  it("initialize 在无当前日记时不应创建（进页面只读）", async () => {
    vi.mocked(tauri.diaryListEntries).mockResolvedValue([]);

    await useDiaryStore.getState().initialize();

    const state = useDiaryStore.getState();
    expect(tauri.diaryListEntries).toHaveBeenCalledTimes(1);
    expect(tauri.diaryUpsertEntry).not.toHaveBeenCalled();
    expect(state.currentEntry).toBeNull();
    expect(state.initialized).toBe(true);
  });

  it("openAt 在无当前日记时创建空白日记（用户手动入口）", async () => {
    vi.mocked(tauri.diaryListEntries).mockResolvedValue([]);
    vi.mocked(tauri.diaryUpsertEntry).mockResolvedValue(
      makeDiaryEntry({
        id: 11,
        type: "daily",
        date: "2026-02-22",
        segments: [
          {
            id: 1,
            diaryId: 11,
            contentId: 2001,
            content: [],
            wordCount: 0,
            createTime: 1,
            updateTime: 1,
            tags: [],
          },
        ],
      })
    );

    const contentId = await useDiaryStore.getState().openAt("daily", "2026-02-22");

    expect(tauri.diaryUpsertEntry).toHaveBeenCalledTimes(1);
    expect(contentId).toBe(2001);
    expect(useDiaryStore.getState().currentEntry?.id).toBe(11);
  });

  it("setMode 切换类型无对应日记时不落库", async () => {
    vi.mocked(tauri.diaryListEntries).mockResolvedValue([]);

    await useDiaryStore.getState().setMode("weekly");

    const state = useDiaryStore.getState();
    expect(tauri.diaryUpsertEntry).not.toHaveBeenCalled();
    expect(state.mode).toBe("weekly");
    expect(state.currentEntry).toBeNull();
  });

  it("shiftDate 翻日期无对应日记时不落库", async () => {
    vi.mocked(tauri.diaryListEntries).mockResolvedValue([]);

    await useDiaryStore.getState().shiftDate(1);

    const state = useDiaryStore.getState();
    expect(tauri.diaryUpsertEntry).not.toHaveBeenCalled();
    expect(state.currentEntry).toBeNull();
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

  it("正文入口保存后只更新对应片段的缓存，不再调用日记写入", async () => {
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
          tags: [],
        },
        {
          id: 12,
          diaryId: 1,
          contentId: 102,
          content: [],
          wordCount: 0,
          createTime: 2,
          updateTime: 2,
          tags: [],
        },
      ],
    });
    getQueryClient().setQueryData(["diary", "entries"], [entry]);
    useDiaryStore.setState({
      currentEntry: entry,
      activeSegmentId: 12,
    });
    const content: DiaryEntry["content"] = [
      { type: "paragraph", children: [{ type: "formatted", text: "新内容" }] },
    ];
    useDiaryStore
      .getState()
      .syncEntryContentByContentId({ contentId: 102, content, wordCount: 3, updateTime: 3 });
    const updated = useDiaryStore.getState().currentEntry!;
    expect(updated.segments[0]).toEqual(entry.segments[0]);
    expect(updated.segments[1].content).toEqual(content);
    expect(updated.wordCount).toBe(3);
    expect(tauri.diaryUpsertEntry).not.toHaveBeenCalled();
  });

  it("打开已有日记只返回正文身份，不重新创建或保存正文", async () => {
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
          tags: [],
        },
        {
          id: 12,
          diaryId: 1,
          contentId: 102,
          content: [],
          wordCount: 0,
          createTime: 2,
          updateTime: 2,
          tags: [],
        },
      ],
    });
    getQueryClient().setQueryData(["diary", "entries"], [entry]);
    useDiaryStore.setState({
      currentEntry: entry,
      activeSegmentId: 11,
    });
    expect(await useDiaryStore.getState().openAt("daily", entry.date)).toBe(102);
    expect(useDiaryStore.getState().activeSegmentId).toBe(12);
    expect(tauri.diaryUpsertEntry).not.toHaveBeenCalled();
  });

  it("创建失败保留原状态并向调用方报告，不保存失败正文副本", async () => {
    vi.mocked(tauri.diaryListEntries).mockResolvedValue([]);
    vi.mocked(tauri.diaryUpsertEntry).mockRejectedValueOnce(new Error("create failed"));
    await expect(useDiaryStore.getState().openAt("daily", "2026-02-22")).rejects.toThrow(
      "create failed"
    );
    expect(useDiaryStore.getState().currentEntry).toBeNull();
    expect(getQueryClient().getQueryData(["diary", "entries"])).toEqual([]);
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
      tags: [],
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

  it("删除最后一个片段后清空当前日记并移出缓存", async () => {
    const only = {
      id: 11,
      diaryId: 1,
      contentId: 101,
      content: [],
      wordCount: 0,
      createTime: 1,
      updateTime: 1,
      tags: [],
    };
    const entry = makeDiaryEntry({ segments: [only] });
    getQueryClient().setQueryData(["diary", "entries"], [entry]);
    useDiaryStore.setState({ currentEntry: entry, activeSegmentId: 11 });
    vi.mocked(tauri.diaryDeleteSegment).mockResolvedValue(null);

    await useDiaryStore.getState().deleteCurrentSegment();

    expect(useDiaryStore.getState().currentEntry).toBeNull();
    expect(useDiaryStore.getState().activeSegmentId).toBeNull();
    expect(getQueryClient().getQueryData(["diary", "entries"])).toEqual([]);
  });
});
