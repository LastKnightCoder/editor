import { describe, expect, it } from "vitest";
import type { VideoNoteHighlight, VideoNoteTopic } from "@/types";
import {
  createGetVideoNoteHighlightsTool,
  createGetVideoNoteThemeContextTool,
  createSearchVideoNoteHighlightsTool,
  type VideoNoteChatContextProvider,
} from "@/tools/videoNoteSearchTool";

const highlights: VideoNoteHighlight[] = [
  {
    id: "a",
    topicId: "t-open",
    title: "Open source creates leverage",
    quote: "Open source lowers team onboarding cost.",
    start: 1000,
    end: 6000,
    startSegmentIdx: 0,
    endSegmentIdx: 1,
    startCharOffset: 0,
    endCharOffset: 20,
    confidence: 0.88,
  },
  {
    id: "b",
    topicId: "t-infra",
    title: "Infra bugs determine outcomes",
    quote: "Infrastructure failures can negate model quality.",
    start: 7000,
    end: 12000,
    startSegmentIdx: 2,
    endSegmentIdx: 3,
    startCharOffset: 3,
    endCharOffset: 30,
    confidence: 0.79,
  },
];

const topics: VideoNoteTopic[] = [
  { id: "t-infra", name: "Infra", source: "auto" },
  { id: "t-open", name: "Open Source", source: "custom" },
];

const provider: VideoNoteChatContextProvider = {
  getContext: () => ({
    selectedTheme: "Infra",
    availableThemes: ["Infra", "Open Source", "Research"],
    visibleHighlights: highlights,
    topics,
    insightsObsolete: true,
  }),
};

const parse = (content: string) =>
  JSON.parse(content) as Record<string, unknown>;

describe("video note chat tools", () => {
  it("get_video_note_highlights 返回结构化高亮列表", async () => {
    const tool = createGetVideoNoteHighlightsTool(provider);
    const result = await tool.executor({ limit: 1 });
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect(payload.selectedTheme).toBe("Infra");
    expect(Array.isArray(payload.highlights)).toBe(true);
    expect((payload.highlights as unknown[]).length).toBe(1);
    expect(
      (payload.highlights as Array<{ startSegmentIdx: number }>)[0]
        .startSegmentIdx,
    ).toBe(0);
  });

  it("search_video_note_highlights 按相关度返回结果", async () => {
    const tool = createSearchVideoNoteHighlightsTool(provider);
    const result = await tool.executor({ query: "infra", limit: 5 });
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect(payload.query).toBe("infra");
    expect((payload.results as Array<{ id: string }>)[0].id).toBe("b");
    expect(
      (payload.results as Array<{ startCharOffset: number }>)[0]
        .startCharOffset,
    ).toBe(3);
  });

  it("get_video_note_theme_context 返回主题来源和过期状态", async () => {
    const tool = createGetVideoNoteThemeContextTool(provider);
    const result = await tool.executor({});
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect(payload.selectedTheme).toBe("Infra");
    expect(payload.visibleHighlightsCount).toBe(2);
    expect(payload.source).toBe("auto");
    expect(payload.obsolete).toBe(true);
    expect(Array.isArray(payload.availableThemes)).toBe(true);
  });
});
