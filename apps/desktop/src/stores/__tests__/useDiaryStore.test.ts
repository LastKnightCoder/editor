import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";

import useDiaryStore from "@/stores/useDiaryStore";
import * as commands from "@/commands";
import type { DiaryEntry, DiarySegment } from "@/types/diary";

vi.mock("@/commands", () => ({
  getAllDiaryEntries: vi.fn(),
  getAllDiarySegmentsFlat: vi.fn(),
  getAllDiaryTagSettings: vi.fn(),
  createDiaryEntry: vi.fn(),
  updateDiaryEntry: vi.fn(),
  deleteDiaryEntry: vi.fn(),
  getDiaryHeatmapData: vi.fn(),
  createDiarySegment: vi.fn(),
  updateDiarySegment: vi.fn(),
  deleteDiarySegment: vi.fn(),
  upsertDiaryTagSetting: vi.fn(),
  deleteDiaryTagSetting: vi.fn(),
}));

const paragraph = (text: string): Descendant[] => [
  { type: "paragraph", children: [{ text }] } as Descendant,
];

const createSegment = (
  overrides: Partial<DiarySegment> = {},
): DiarySegment => ({
  id: 1,
  diaryId: 1,
  contentId: 10,
  wordCount: 2,
  createTime: 1,
  updateTime: 1,
  content: paragraph("旧"),
  ...overrides,
});

const createEntry = (overrides: Partial<DiaryEntry> = {}): DiaryEntry => {
  const segments = overrides.segments ?? [createSegment()];
  return {
    id: 1,
    type: "daily",
    date: "2026-06-21",
    contentId: null,
    weather: null,
    mood: null,
    tags: [],
    wordCount: segments.reduce((sum, segment) => sum + segment.wordCount, 0),
    createTime: 1,
    updateTime: 1,
    segments,
    content: segments.flatMap((segment) => segment.content),
    ...overrides,
  };
};

const resetDiaryStore = () => {
  useDiaryStore.setState(
    {
      initLoading: true,
      diaryEntries: [],
      segmentsFlat: [],
      tagSettings: [],
      activeTagFilter: [],
      activeDateRange: null,
      searchQuery: "",
      visibleCount: 20,
      momentScrollPosition: 0,
      currentDate: "2026-06-21",
      heatmapDataCache: new Map(),
      activeEntryId: undefined,
    },
    false,
  );
};

describe("useDiaryStore diary moments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDiaryStore();
    vi.mocked(commands.getAllDiarySegmentsFlat).mockResolvedValue([]);
  });

  it("当天无日记时创建 moment 只创建一个带单 segment 的 entry", async () => {
    const createdSegment = createSegment({
      id: 11,
      contentId: 101,
      wordCount: 3,
      content: paragraph("新记录"),
    });
    const createdEntry = createEntry({
      id: 7,
      segments: [createdSegment],
      wordCount: 3,
      content: createdSegment.content,
    });
    vi.mocked(commands.createDiaryEntry).mockResolvedValue(createdEntry);

    await useDiaryStore.getState().onCreateMoment(paragraph("新记录"));

    expect(commands.createDiaryEntry).toHaveBeenCalledWith({
      type: "daily",
      date: "2026-06-21",
      weather: null,
      mood: null,
      tags: [],
      segments: [paragraph("新记录")],
    });
    expect(commands.createDiarySegment).not.toHaveBeenCalled();
    expect(useDiaryStore.getState().diaryEntries).toHaveLength(1);
    expect(useDiaryStore.getState().diaryEntries[0].segments).toHaveLength(1);
  });

  it("当天已有日记时创建 moment 只追加一个 segment 并同步汇总", async () => {
    const existing = createEntry({
      segments: [
        createSegment({
          id: 1,
          wordCount: 2,
          content: paragraph("旧"),
        }),
      ],
    });
    const created = createSegment({
      id: 2,
      diaryId: existing.id,
      wordCount: 4,
      updateTime: 5,
      content: paragraph("新增"),
    });
    vi.mocked(commands.createDiarySegment).mockResolvedValue(created);
    useDiaryStore.setState({ diaryEntries: [existing] }, false);

    await useDiaryStore.getState().onCreateMoment(paragraph("新增"));

    const entry = useDiaryStore.getState().diaryEntries[0];
    expect(commands.createDiarySegment).toHaveBeenCalledTimes(1);
    expect(entry.segments).toHaveLength(2);
    expect(entry.wordCount).toBe(6);
    expect(entry.content).toEqual([...paragraph("旧"), ...paragraph("新增")]);
  });

  it("更新 segment 后同步 entry 汇总并清理热力图缓存", async () => {
    const existing = createEntry();
    const cache = new Map([
      ["2026-06", [{ date: "2026-06-21", wordCount: 2 }]],
    ]);
    const updated = createSegment({
      id: 1,
      wordCount: 5,
      updateTime: 9,
      content: paragraph("更新后"),
    });
    vi.mocked(commands.updateDiarySegment).mockResolvedValue(updated);
    useDiaryStore.setState(
      {
        diaryEntries: [existing],
        segmentsFlat: [
          {
            id: 1,
            diaryId: 1,
            contentId: 10,
            wordCount: 2,
            createTime: 1,
            updateTime: 1,
            content: paragraph("旧"),
            entryDate: "2026-06-21",
            entryDateMs: new Date("2026-06-21T00:00:00").getTime(),
            weather: null,
            mood: null,
            tags: [],
          },
        ],
        heatmapDataCache: cache,
      },
      false,
    );

    await useDiaryStore
      .getState()
      .onUpdateDiarySegment(updated.id, updated.content);

    const entry = useDiaryStore.getState().diaryEntries[0];
    const flatItem = useDiaryStore.getState().segmentsFlat[0];
    expect(entry.wordCount).toBe(5);
    expect(entry.content).toEqual(paragraph("更新后"));
    expect(flatItem.content).toEqual(paragraph("更新后"));
    expect(flatItem.wordCount).toBe(5);
    expect(useDiaryStore.getState().heatmapDataCache.has("2026-06")).toBe(
      false,
    );
  });
});
