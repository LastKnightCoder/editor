import type { ToolDefinition } from "@/types/tool";
import { searchVideoNoteContent } from "@/commands/video-note-index";
import { getVideoNoteById } from "@/commands/video-notes";

const tryParseLimit = (value: unknown, fallback: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
};

const parseNonNegativeNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

const formatMs = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export const buildVideoNoteSystemPrompt = (params: { transcript: string }): string => {
  const { transcript } = params;
  const transcriptLength = transcript.trim().length;

  return `你是视频学习助手，围绕当前视频内容回答问题。

## 可用工具
- search_video_note_knowledge：按语义和关键词检索视频转录片段。
- get_video_note_transcript_range：按时间范围获取一整段转录，支持向前或向后扩展上下文。

## 回答要求
- 回答前优先调用工具获取证据，不要直接猜测。
- 回答基于视频转录内容，不要凭空补充未出现的信息。
- 需要引用时，优先给出对应时间段。
- 如信息不足，明确说明并提示用户继续提问或重新检索。
- 如果 search_video_note_knowledge 只命中了局部片段，但问题明显在连续讲同一主题，先调用 search_video_note_knowledge 定位，再调用 get_video_note_transcript_range，并使用命中结果的 start/end 作为基础时间范围，按需扩展前后几秒获取更完整上下文。

## 当前上下文快照
- 转录长度（字符）：${transcriptLength}`;
};

export const createVideoNoteSearchTool = (
  videoNoteId: number,
  mainDbName: string
): ToolDefinition => ({
  name: "search_video_note_knowledge",
  description: "搜索当前视频笔记的转录索引内容，返回最相关的时间片段，便于问答时精准引用。",
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
  executor: async args => {
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
        results: results.map(item => ({
          start: item.start,
          end: item.end,
          text: item.text,
          score: item.score,
          rrfScore: item.rrfScore,
        })),
      }),
    };
  },
});

export const createGetVideoNoteTranscriptRangeTool = (videoNoteId: number): ToolDefinition => ({
  name: "get_video_note_transcript_range",
  description: "按时间戳范围获取当前视频笔记的一整段转录内容，支持向前或向后扩展若干秒上下文。",
  parameters: {
    type: "object",
    properties: {
      startTime: {
        type: "number",
        description: "起始时间（毫秒）。通常可直接使用搜索命中结果的 start。",
      },
      endTime: {
        type: "number",
        description: "结束时间（毫秒）。通常可直接使用搜索命中结果的 end。",
      },
      expandBeforeSeconds: {
        type: "number",
        description: "可选，向前扩展的秒数，默认 0。",
      },
      expandAfterSeconds: {
        type: "number",
        description: "可选，向后扩展的秒数，默认 0。",
      },
      maxSegments: {
        type: "number",
        description: "可选，返回的最大片段数，默认 200，最大 500。",
      },
    },
    required: ["startTime", "endTime"],
  },
  executor: async args => {
    const startTime = parseNonNegativeNumber(args.startTime);
    const endTime = parseNonNegativeNumber(args.endTime);
    const expandBeforeSeconds = parseNonNegativeNumber(args.expandBeforeSeconds) ?? 0;
    const expandAfterSeconds = parseNonNegativeNumber(args.expandAfterSeconds) ?? 0;
    const maxSegments = tryParseLimit(args.maxSegments, 200, 500);

    if (startTime === null || endTime === null) {
      return {
        content: JSON.stringify({
          success: false,
          error: "startTime 和 endTime 必须是大于等于 0 的数字",
        }),
      };
    }

    if (startTime > endTime) {
      return {
        content: JSON.stringify({
          success: false,
          error: "startTime 不能大于 endTime",
        }),
      };
    }

    const videoNote = await getVideoNoteById(videoNoteId);

    if (!videoNote) {
      return {
        content: JSON.stringify({
          success: false,
          error: `视频笔记 ${videoNoteId} 不存在`,
        }),
      };
    }

    if (!videoNote.transcriptSegments || videoNote.transcriptSegments.length === 0) {
      return {
        content: JSON.stringify({
          success: false,
          error: "该视频笔记没有转录片段",
        }),
      };
    }

    const lastSegment = videoNote.transcriptSegments[videoNote.transcriptSegments.length - 1];
    const rangeStart = Math.max(0, startTime - expandBeforeSeconds * 1000);
    const rangeEnd = Math.min(lastSegment.end, endTime + expandAfterSeconds * 1000);

    let matchedSegments = videoNote.transcriptSegments.filter(
      segment => segment.end >= rangeStart && segment.start <= rangeEnd
    );

    const truncated = matchedSegments.length > maxSegments;
    if (truncated) {
      matchedSegments = matchedSegments.slice(0, maxSegments);
    }

    return {
      content: JSON.stringify({
        success: true,
        videoNoteId,
        requestedRange: {
          start: startTime,
          end: endTime,
          startTime: formatMs(startTime),
          endTime: formatMs(endTime),
        },
        range: {
          start: rangeStart,
          end: rangeEnd,
          startTime: formatMs(rangeStart),
          endTime: formatMs(rangeEnd),
        },
        expansion: {
          beforeSeconds: expandBeforeSeconds,
          afterSeconds: expandAfterSeconds,
        },
        returnedSegments: matchedSegments.length,
        truncated,
        transcript: matchedSegments.map(segment => segment.text).join(" "),
        segments: matchedSegments.map(segment => ({
          text: segment.text,
          start: segment.start,
          end: segment.end,
          startTime: formatMs(segment.start),
          endTime: formatMs(segment.end),
        })),
      }),
    };
  },
});
