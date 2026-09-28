import type { ToolParameterSchema } from "@/types";
import * as commands from "@/commands/video-notes";
import { bindDatabaseCommands } from "@/services/command-context";
import { contextualTools } from "@/tools/contextualTools";
import type { MCPProviderDefinition } from "./types";

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const value = `${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${value}` : value;
}

export const videoNoteToolsProvider: MCPProviderDefinition = {
  id: "video-note-tools",
  name: "视频笔记工具",
  description: "提供视频笔记的转录、总结和时间片段的查询工具",
  defaultEnabled: true,
  tools: () =>
    contextualTools(context => {
      const { getVideoNoteById } = bindDatabaseCommands(commands, context);
      return [
        {
          name: "get_video_note_summary",
          risk: "read",
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
          executor: async args => {
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
                2
              ),
            };
          },
        },
        {
          name: "search_video_note_transcript",
          risk: "read",
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
          executor: async args => {
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

            if (!videoNote.transcriptSegments || videoNote.transcriptSegments.length === 0) {
              return {
                content: JSON.stringify({
                  error: "该视频笔记没有转录片段",
                  hasSegments: false,
                }),
              };
            }

            // 搜索包含关键词的片段
            const matchedSegments = videoNote.transcriptSegments.filter(seg => {
              if (caseSensitive) {
                return seg.text.includes(keyword);
              }
              return seg.text.toLowerCase().includes(keyword.toLowerCase());
            });

            // 限制结果数量
            const truncated = matchedSegments.length > maxResults;
            const results = matchedSegments.slice(0, maxResults).map(seg => ({
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
                2
              ),
            };
          },
        },
      ];
    }),
};
