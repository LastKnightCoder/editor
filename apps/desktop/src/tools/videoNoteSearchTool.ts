import type { ToolDefinition } from "@/types/tool";
import { searchVideoNoteContent } from "@/commands/video-note-index";

export const createVideoNoteSearchTool = (
  videoNoteId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "search_video_note_knowledge",
  description:
    "搜索当前视频笔记的转录索引内容，返回最相关的时间片段，便于问答时精准引用。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词或问题",
      },
      limit: {
        type: "number",
        description: "返回条数，默认 5，最大 10",
      },
    },
    required: ["query"],
  },
  executor: async (args) => {
    const query = String(args.query || "").trim();
    const limit = Math.min(Number(args.limit || 5), 10);
    if (!query) {
      return {
        content: JSON.stringify({
          success: false,
          error: "query 不能为空",
          results: [],
        }),
      };
    }

    const results = await searchVideoNoteContent({
      videoNoteId,
      mainDbName,
      query,
      limit,
    });

    return {
      content: JSON.stringify({
        success: true,
        message: `找到 ${results.length} 条相关片段`,
        results: results.map((item) => ({
          start: item.start,
          end: item.end,
          text: item.text,
          score: item.score,
          rrfScore: item.rrfScore,
          rerankScore: item.rerankScore,
        })),
      }),
    };
  },
});
