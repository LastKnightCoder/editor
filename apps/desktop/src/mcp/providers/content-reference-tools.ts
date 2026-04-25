import type { ToolParameterSchema } from "@/types";
import { getContentById } from "@/commands/content";
import { getArticleByContentId } from "@/commands/article";
import { loadSnapshotForContent } from "@/services/content-editing/resolver";
import { getEditorText } from "@/utils/editor";
import {
  getAnswerContentStatus,
  getAnswerPrimaryContentType,
} from "@/utils/answer-content";
import type { MCPProviderDefinition } from "./types";

const toToolError = (
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) => ({
  success: false,
  errorCode: code,
  message,
  ...extra,
});

const resolveReferencePayload = async (contentId: number) => {
  const [{ snapshot }, content, status] = await Promise.all([
    loadSnapshotForContent(contentId),
    getContentById(contentId),
    getAnswerContentStatus(contentId),
  ]);
  const contentType = getAnswerPrimaryContentType(status);
  const article =
    contentType === "article" ? await getArticleByContentId(contentId) : null;
  const title =
    article?.title?.trim() ||
    getEditorText(content?.content || [], 20).trim() ||
    `内容 #${contentId}`;

  return {
    contentId,
    contentType,
    title,
    markdown: snapshot.markdown,
    hash: snapshot.hash,
    snapshotId: snapshot.id,
    totalLength: snapshot.markdown.length,
    updateTime: content?.updateTime ?? null,
  };
};

export const contentReferenceToolsProvider: MCPProviderDefinition = {
  id: "content-reference-tools",
  name: "内容引用工具",
  description: "提供按 contentId 读取正文与引用元数据的只读工具",
  defaultEnabled: true,
  tools: () => [
    {
      name: "get_referenced_content",
      description:
        "按 contentId 读取被用户显式提及内容的 Markdown 正文。支持可选范围截断，适合回答前核对正文证据。",
      parameters: {
        type: "object",
        properties: {
          contentId: {
            type: "number",
            description: "contents 表主键 contentId",
          },
          range: {
            type: "array",
            description: "可选字符范围 [start, end]，用于截断返回内容",
            items: { type: "number" },
            minItems: 2,
            maxItems: 2,
          },
        } as Record<string, ToolParameterSchema>,
        required: ["contentId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const contentId = args.contentId as number;
        const range = args.range as [number, number] | undefined;

        try {
          const payload = await resolveReferencePayload(contentId);
          let markdown = payload.markdown;
          let usedRange:
            | {
                start: number;
                end: number;
              }
            | undefined;

          if (range) {
            const rawStart = Number.isFinite(range[0]) ? range[0] : 0;
            const rawEnd = Number.isFinite(range[1])
              ? range[1]
              : payload.totalLength;
            const start = Math.max(0, Math.min(rawStart, payload.totalLength));
            const end = Math.max(start, Math.min(rawEnd, payload.totalLength));
            markdown = payload.markdown.slice(start, end);
            usedRange = { start, end };
          }

          return {
            content: JSON.stringify(
              {
                success: true,
                ...payload,
                markdown,
                returnedLength: markdown.length,
                truncated: Boolean(
                  usedRange &&
                  (usedRange.start > 0 || usedRange.end < payload.totalLength),
                ),
                range: usedRange,
              },
              null,
              2,
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              toToolError(
                "GET_REFERENCED_CONTENT_FAILED",
                (error as Error).message,
                {
                  contentId,
                },
              ),
              null,
              2,
            ),
          };
        }
      },
    },
    {
      name: "get_referenced_contents",
      description:
        "批量按 contentId 读取多条被提及内容的正文与元数据。适合一次性拉取多个引用源后再综合回答。",
      parameters: {
        type: "object",
        properties: {
          contentIds: {
            type: "array",
            items: { type: "number" },
            description: "contents 表主键 contentId 数组，单次最多 10 个",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["contentIds"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const contentIds = Array.from(
          new Set((args.contentIds as number[]).filter((id) => id > 0)),
        );

        if (contentIds.length > 10) {
          return {
            content: JSON.stringify(
              toToolError("TOO_MANY_REFERENCES", "单次最多读取 10 条引用内容"),
              null,
              2,
            ),
          };
        }

        try {
          const items = await Promise.all(
            contentIds.map((contentId) => resolveReferencePayload(contentId)),
          );
          return {
            content: JSON.stringify(
              {
                success: true,
                items,
              },
              null,
              2,
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              toToolError(
                "GET_REFERENCED_CONTENTS_FAILED",
                (error as Error).message,
              ),
              null,
              2,
            ),
          };
        }
      },
    },
    {
      name: "get_referenced_content_meta",
      description:
        "读取被提及内容的元数据，不返回全文。适合先看类型、标题、长度和快照信息，再决定是否继续读取正文。",
      parameters: {
        type: "object",
        properties: {
          contentId: {
            type: "number",
            description: "contents 表主键 contentId",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["contentId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const contentId = args.contentId as number;

        try {
          const payload = await resolveReferencePayload(contentId);
          return {
            content: JSON.stringify(
              {
                success: true,
                contentId: payload.contentId,
                contentType: payload.contentType,
                title: payload.title,
                totalLength: payload.totalLength,
                hash: payload.hash,
                snapshotId: payload.snapshotId,
                updateTime: payload.updateTime,
              },
              null,
              2,
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              toToolError(
                "GET_REFERENCED_CONTENT_META_FAILED",
                (error as Error).message,
                {
                  contentId,
                },
              ),
              null,
              2,
            ),
          };
        }
      },
    },
  ],
};
