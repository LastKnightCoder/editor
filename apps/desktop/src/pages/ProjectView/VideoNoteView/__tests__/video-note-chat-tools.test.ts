import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoNoteHighlight, VideoNoteTopic } from "@/types";
import { getVideoNoteById } from "@/commands/video-notes";
import {
  buildVideoNoteSystemPrompt,
  createGetVideoNoteHighlightsTool,
  createGetVideoNoteTranscriptRangeTool,
  createSearchVideoNoteHighlightsTool,
  type VideoNoteChatContextProvider,
} from "@/tools/videoNoteSearchTool";

vi.mock("@/commands/video-notes", () => ({
  getVideoNoteById: vi.fn(),
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("get_video_note_transcript_range 应按时间范围返回整段转录并支持前后扩展秒数", async () => {
    vi.mocked(getVideoNoteById).mockResolvedValue({
      id: 42,
      transcript: "完整转录",
      transcriptSegments: [
        { text: "开场", start: 0, end: 4000 },
        { text: "主题铺垫", start: 4000, end: 9000 },
        { text: "核心观点", start: 9000, end: 14000 },
        { text: "案例补充", start: 14000, end: 20000 },
      ],
    } as any);

    const tool = createGetVideoNoteTranscriptRangeTool(42);
    const result = await tool.executor({
      startTime: 10000,
      endTime: 12000,
      expandBeforeSeconds: 2,
      expandAfterSeconds: 5,
    });
    const payload = parse(String((result as { content: string }).content));
    const range = payload.range as { start: number; end: number };

    expect(payload.success).toBe(true);
    expect(range.start).toBe(8000);
    expect(range.end).toBe(17000);
    expect(payload.returnedSegments).toBe(3);
    expect(payload.transcript).toBe("主题铺垫 核心观点 案例补充");
  });

  it("buildVideoNoteSystemPrompt 应提示先搜索定位再按时间范围获取整段转录", () => {
    const prompt = buildVideoNoteSystemPrompt({
      transcript: "一段转录",
      selectedTheme: "Infra",
      visibleHighlights: highlights,
      availableThemes: ["Infra", "Open Source"],
      insightsObsolete: false,
    });

    expect(prompt).toContain("get_video_note_transcript_range");
    expect(prompt).not.toContain("get_video_note_topic_context");
    expect(prompt).toContain("先调用 search_video_note_knowledge");
    expect(prompt).toContain("再调用 get_video_note_transcript_range");
  });
});
