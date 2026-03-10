import type { ToolDefinition } from "@/types/tool";
import type { IndexType } from "@/types/search";
import { searchContent } from "@/utils/search";
import { getMarkdown } from "@/utils/markdown-helper";
import { getTypeDisplayName } from "@/utils/rag-helper";
import useSettingStore from "@/stores/useSettingStore";
import { resolveEmbeddingModelInfoFromProvider } from "@/utils/embedding-model-info";
import { Descendant } from "slate";

const VALID_TYPES: IndexType[] = [
  "card",
  "article",
  "project-item",
  "document-item",
  "diary-daily",
  "diary-weekly",
  "diary-monthly",
];

export const createKnowledgeSearchTool = (): ToolDefinition => ({
  name: "search_knowledge",
  description:
    "搜索用户的个人知识库内容，包括卡片、文章、项目条目、文档条目、日记、周记、月记等。" +
    "当用户的问题可能涉及其已有的笔记、资料或知识时，使用此工具进行检索。" +
    "返回匹配的内容列表（标题、完整内容、类型、ID 等），可在后续回答中引用。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词或问题",
      },
      types: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "card",
            "article",
            "project-item",
            "document-item",
            "diary-daily",
            "diary-weekly",
            "diary-monthly",
          ],
        },
        description:
          "可选，限定搜索的内容类型。不传则搜索所有类型。可选值：card（卡片）、article（文章）、project-item（项目条目）、document-item（文档条目）、diary-daily（日记）、diary-weekly（周记）、diary-monthly（月记）",
      },
      limit: {
        type: "number",
        description: "返回结果数量，默认 5，最大 10",
      },
    },
    required: ["query"],
  },
  executor: async (args) => {
    const {
      query,
      types,
      limit = 5,
    } = args as {
      query: string;
      types?: string[];
      limit?: number;
    };

    if (!query || !query.trim()) {
      return {
        content: JSON.stringify({
          success: false,
          error: "搜索关键词不能为空",
          results: [],
        }),
      };
    }

    try {
      const embeddingProvider =
        useSettingStore.getState().setting.embeddingProvider;
      const modelInfo =
        resolveEmbeddingModelInfoFromProvider(embeddingProvider);

      const searchTypes =
        types && types.length > 0
          ? (types.filter((t) =>
              VALID_TYPES.includes(t as IndexType),
            ) as IndexType[])
          : VALID_TYPES;

      const results = await searchContent({
        query: query.trim(),
        types: searchTypes,
        limit: Math.min(limit, 10),
        modelInfo,
      });

      if (results.length === 0) {
        return {
          content: JSON.stringify({
            success: true,
            message: "未找到相关内容",
            count: 0,
            results: [],
          }),
          metadata: {
            render: {
              rendererKey: "knowledge-search",
              version: 1,
              payload: null,
            },
          },
        };
      }

      const formattedResults = results.map((r) => ({
        id: r.id,
        contentId: r.contentId,
        type: r.type,
        typeName: getTypeDisplayName(r.type),
        title: r.title || "无标题",
        content: getMarkdown(r.content as Descendant[]),
        updateTime: r.updateTime,
        source: r.source,
        ...(r.date ? { date: r.date } : {}),
      }));

      return {
        content: JSON.stringify({
          success: true,
          message: `找到 ${results.length} 条相关内容`,
          count: results.length,
          results: formattedResults,
        }),
        metadata: {
          render: {
            rendererKey: "knowledge-search",
            version: 1,
            payload: null,
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: JSON.stringify({
          success: false,
          error: `搜索失败: ${errorMessage}`,
          results: [],
        }),
      };
    }
  },
});
