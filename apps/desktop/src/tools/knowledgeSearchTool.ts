import { locatesSection } from "@/entity/section-location";
import type { ToolDefinition } from "@/types/tool";
import type { IndexType } from "@/types/search";
import { searchContent } from "@/utils/search";
import { getMarkdown } from "@/utils/markdown";
import { getTypeDisplayName } from "@/utils/rag-helper";
import useSettingStore from "@/stores/useSettingStore";
import { resolveEmbeddingModelInfoFromSetting } from "@/utils/embedding-model-info";
import { Descendant } from "slate";

// 我的思考 + 外部材料（划线 / PDF 标注 / 剪藏，KL-037）
const VALID_TYPES: IndexType[] = [
  "card",
  "article",
  "project-item",
  "diary-moment",
  "excerpt",
  "pdf-annotation",
  "web-clip",
];

export const createKnowledgeSearchTool = (): ToolDefinition => ({
  name: "search_knowledge",
  risk: "read",
  description:
    "搜索用户的个人知识库内容，包括卡片、文章、项目条目、日记，以及读书划线、网页划线、PDF 标注、剪藏网页等阅读材料。" +
    "当用户的问题可能涉及其已有的笔记、资料或知识时，使用此工具进行检索。" +
    "返回匹配的内容列表（标题、命中节内容与标题路径、类型、ID 等），可在后续回答中引用；需要整篇时再读取全文。" +
    "结果含 section 时引用使用 :ref[文字]{id=ID type=类型 block=section.blockStart的数值}，可打开到命中节。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "纯检索语句，只包含要查找的主题内容。" +
          "正确示例：「JavaScript 中 this 的用法和绑定规则」「React hooks 性能优化」。" +
          "错误示例：「请帮我搜索关于 this 的笔记」「我知识库里有没有 React 的文章」。" +
          "不要包含对话指令、「请检索」「我的笔记」等非检索内容，这些会严重干扰检索准确性",
      },
      types: {
        type: "array",
        items: {
          type: "string",
          enum: VALID_TYPES,
        },
        description:
          "可选，限定搜索的内容类型。不传则搜索所有类型。可选值：card（卡片）、article（文章）、project-item（项目条目）、diary-moment（日记）、" +
          "excerpt（读书 / 网页划线）、pdf-annotation（PDF 标注）、web-clip（剪藏网页）",
      },
      limit: {
        type: "number",
        description: "返回结果数量，默认 5，最大 10",
      },
    },
    required: ["query"],
  },
  executor: async (args, context) => {
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
      const t0 = performance.now();
      const settings = useSettingStore.getState().setting;
      const modelInfo = resolveEmbeddingModelInfoFromSetting(settings);

      const searchTypes =
        types && types.length > 0
          ? (types.filter(t => VALID_TYPES.includes(t as IndexType)) as IndexType[])
          : VALID_TYPES;

      console.log(
        "[search_knowledge] 开始搜索",
        JSON.stringify({
          query: query.trim(),
          types: searchTypes,
          limit: Math.min(limit, 10),
          hasModelInfo: !!modelInfo,
        })
      );

      const t1 = performance.now();
      const results =
        (await searchContent(
          {
            query: query.trim(),
            types: searchTypes,
            limit: Math.min(limit, 10),
            modelInfo,
          },
          context
        )) ?? [];
      const t2 = performance.now();

      console.log(
        `[search_knowledge] searchContent 完成: ${results.length} 条结果, 耗时 ${(t2 - t1).toFixed(0)}ms`
      );

      if (results.length === 0) {
        console.log(`[search_knowledge] 总耗时 ${(performance.now() - t0).toFixed(0)}ms (无结果)`);
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

      const formattedResults = results.map(r => ({
        id: r.id,
        contentId: r.contentId,
        type: r.type,
        typeName: getTypeDisplayName(r.type),
        title: r.title || "无标题",
        content:
          r.section?.text ??
          (["article", "project-item", "web-clip"].includes(r.type)
            ? (r.snippet ?? "")
            : r.content
              ? getMarkdown(r.content as Descendant[])
              : ""),
        ...(!r.section && ["article", "project-item", "web-clip"].includes(r.type)
          ? { sectionUnavailable: true }
          : {}),
        ...(r.section && locatesSection(r.type) ? { section: r.section } : {}),
        updateTime: r.updateTime,
        source: r.source,
        ...(r.date ? { date: r.date } : {}),
        // 外部材料：出处（书名与章节 / 网页 / PDF 页码），回答引用时可说明来源
        ...(r.material ? { from: r.material.meta } : {}),
      }));
      const t3 = performance.now();

      console.log(
        `[search_knowledge] 格式化完成, 耗时 ${(t3 - t2).toFixed(0)}ms, 总耗时 ${(t3 - t0).toFixed(0)}ms`
      );

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
      const errorMessage = error instanceof Error ? error.message : String(error);
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
