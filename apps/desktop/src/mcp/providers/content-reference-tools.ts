import type { ToolParameterSchema } from "@/types";
import type { MCPProviderDefinition } from "./types";
import {
  loadReferencedContentBase,
  loadReferencedContentPayload,
} from "./content-read-utils";

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
          const payload = await loadReferencedContentPayload(contentId, range);

          return {
            content: JSON.stringify(
              {
                success: true,
                ...payload,
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
            contentIds.map((contentId) => loadReferencedContentBase(contentId)),
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
          const payload = await loadReferencedContentBase(contentId);
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
