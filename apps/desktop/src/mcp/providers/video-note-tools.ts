import type { ToolParameterSchema } from "@/types";
import { getVideoNoteById } from "@/commands/video-notes";
import type { MCPProviderDefinition } from "./types";

/**
 * 格式化时间（毫秒转为 HH:MM:SS 格式）
 */
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const s = seconds % 60;
  const m = minutes % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export const videoNoteToolsProvider: MCPProviderDefinition = {
  id: "video-note-tools",
  name: "视频笔记工具",
  description: "提供视频笔记的转录、总结和时间片段的查询工具",
  defaultEnabled: true,
  tools: () => [
    {
      name: "get_video_note_transcript",
      description: "获取视频笔记的完整转录文本。返回纯文本格式的转录内容。",
      parameters: {
        type: "object",
        properties: {
          videoNoteId: {
            type: "number",
            description: "视频笔记 ID",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["videoNoteId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const videoNoteId = args.videoNoteId as number;

        const videoNote = await getVideoNoteById(videoNoteId);

        if (!videoNote) {
          return {
            content: JSON.stringify({
              error: `视频笔记 ${videoNoteId} 不存在`,
            }),
          };
        }

        if (!videoNote.transcript) {
          return {
            content: JSON.stringify({
              error: "该视频笔记没有转录内容",
              hasTranscript: false,
            }),
          };
        }

        return {
          content: JSON.stringify(
            {
              videoNoteId: videoNote.id,
              transcript: videoNote.transcript,
              transcriptLength: videoNote.transcript.length,
              hasSegments: !!(
                videoNote.transcriptSegments &&
                videoNote.transcriptSegments.length > 0
              ),
              segmentCount: videoNote.transcriptSegments?.length || 0,
            },
            null,
            2,
          ),
        };
      },
    },
    {
      name: "get_video_note_summary",
      description: "获取视频笔记的总结内容。返回 Markdown 格式的视频总结。",
      parameters: {
        type: "object",
        properties: {
          videoNoteId: {
            type: "number",
            description: "视频笔记 ID",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["videoNoteId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const videoNoteId = args.videoNoteId as number;

        const videoNote = await getVideoNoteById(videoNoteId);

        if (!videoNote) {
          return {
            content: JSON.stringify({
              error: `视频笔记 ${videoNoteId} 不存在`,
            }),
          };
        }

        if (!videoNote.summary) {
          return {
            content: JSON.stringify({
              error: "该视频笔记没有总结内容",
              hasSummary: false,
            }),
          };
        }

        return {
          content: JSON.stringify(
            {
              videoNoteId: videoNote.id,
              summary: videoNote.summary,
              summaryLength: videoNote.summary.length,
            },
            null,
            2,
          ),
        };
      },
    },
    {
      name: "get_video_note_transcript_segments",
      description:
        "获取视频笔记的转录片段列表（带时间戳）。可以指定时间范围或片段数量限制。返回每个片段的文本、开始时间和结束时间。",
      parameters: {
        type: "object",
        properties: {
          videoNoteId: {
            type: "number",
            description: "视频笔记 ID",
          },
          startTime: {
            type: "number",
            description: "可选，开始时间（毫秒）。只返回此时间之后的片段。",
          },
          endTime: {
            type: "number",
            description: "可选，结束时间（毫秒）。只返回此时间之前的片段。",
          },
          maxSegments: {
            type: "number",
            description:
              "可选，返回的最大片段数量。默认无限制。建议设置为 100 以避免返回过多数据。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["videoNoteId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const videoNoteId = args.videoNoteId as number;
        const startTime = args.startTime as number | undefined;
        const endTime = args.endTime as number | undefined;
        const maxSegments = args.maxSegments as number | undefined;

        const videoNote = await getVideoNoteById(videoNoteId);

        if (!videoNote) {
          return {
            content: JSON.stringify({
              error: `视频笔记 ${videoNoteId} 不存在`,
            }),
          };
        }

        if (
          !videoNote.transcriptSegments ||
          videoNote.transcriptSegments.length === 0
        ) {
          return {
            content: JSON.stringify({
              error: "该视频笔记没有转录片段",
              hasTranscript: !!videoNote.transcript,
              hasSegments: false,
            }),
          };
        }

        let segments = videoNote.transcriptSegments;

        // 按时间范围筛选
        if (startTime !== undefined) {
          segments = segments.filter((seg) => seg.start >= startTime);
        }
        if (endTime !== undefined) {
          segments = segments.filter((seg) => seg.end <= endTime);
        }

        // 限制数量
        const truncated = maxSegments ? segments.length > maxSegments : false;
        if (maxSegments && segments.length > maxSegments) {
          segments = segments.slice(0, maxSegments);
        }

        // 格式化片段，添加可读的时间戳
        const formattedSegments = segments.map((seg) => ({
          text: seg.text,
          start: seg.start,
          end: seg.end,
          startTime: formatTime(seg.start),
          endTime: formatTime(seg.end),
          duration: seg.end - seg.start,
        }));

        return {
          content: JSON.stringify(
            {
              videoNoteId: videoNote.id,
              totalSegments: videoNote.transcriptSegments.length,
              returnedSegments: formattedSegments.length,
              truncated,
              timeRange: {
                start: startTime,
                end: endTime,
              },
              segments: formattedSegments,
            },
            null,
            2,
          ),
        };
      },
    },
    {
      name: "search_video_note_transcript",
      description:
        "在视频笔记的转录内容中搜索关键词，返回包含关键词的片段及其时间戳。支持大小写不敏感搜索。",
      parameters: {
        type: "object",
        properties: {
          videoNoteId: {
            type: "number",
            description: "视频笔记 ID",
          },
          keyword: {
            type: "string",
            description: "要搜索的关键词",
          },
          caseSensitive: {
            type: "boolean",
            description: "可选，是否区分大小写。默认 false（不区分）。",
          },
          maxResults: {
            type: "number",
            description: "可选，返回的最大结果数量。默认 50。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["videoNoteId", "keyword"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const videoNoteId = args.videoNoteId as number;
        const keyword = args.keyword as string;
        const caseSensitive = (args.caseSensitive as boolean) ?? false;
        const maxResults = (args.maxResults as number) ?? 50;

        const videoNote = await getVideoNoteById(videoNoteId);

        if (!videoNote) {
          return {
            content: JSON.stringify({
              error: `视频笔记 ${videoNoteId} 不存在`,
            }),
          };
        }

        if (
          !videoNote.transcriptSegments ||
          videoNote.transcriptSegments.length === 0
        ) {
          return {
            content: JSON.stringify({
              error: "该视频笔记没有转录片段",
              hasSegments: false,
            }),
          };
        }

        // 搜索包含关键词的片段
        const matchedSegments = videoNote.transcriptSegments.filter((seg) => {
          if (caseSensitive) {
            return seg.text.includes(keyword);
          }
          return seg.text.toLowerCase().includes(keyword.toLowerCase());
        });

        // 限制结果数量
        const truncated = matchedSegments.length > maxResults;
        const results = matchedSegments.slice(0, maxResults).map((seg) => ({
          index: videoNote.transcriptSegments!.indexOf(seg),
          text: seg.text,
          start: seg.start,
          end: seg.end,
          startTime: formatTime(seg.start),
          endTime: formatTime(seg.end),
        }));

        return {
          content: JSON.stringify(
            {
              videoNoteId: videoNote.id,
              keyword,
              caseSensitive,
              totalMatches: matchedSegments.length,
              returnedResults: results.length,
              truncated,
              results,
            },
            null,
            2,
          ),
        };
      },
    },
  ],
};
