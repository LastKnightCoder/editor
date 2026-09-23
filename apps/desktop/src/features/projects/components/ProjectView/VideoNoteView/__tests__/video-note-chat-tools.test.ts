import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVideoNoteById } from "@/commands/video-notes";
import {
  buildVideoNoteSystemPrompt,
  createGetVideoNoteTranscriptRangeTool,
} from "@/tools/videoNoteSearchTool";

vi.mock("@/commands/video-notes", () => ({
  getVideoNoteById: vi.fn(),
}));

const parse = (content: string) => JSON.parse(content) as Record<string, unknown>;

describe("video note chat tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    });

    expect(prompt).toContain("get_video_note_transcript_range");
    expect(prompt).toContain("先调用 search_video_note_knowledge");
    expect(prompt).toContain("再调用 get_video_note_transcript_range");
  });
});
