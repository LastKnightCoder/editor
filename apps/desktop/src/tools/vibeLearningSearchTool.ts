import type { ToolDefinition } from "@/types/tool";
import type { VLResource, VLSearchResult } from "@/types/vibe-learning";
import { invoke } from "@/electron";

const stringifyResult = (payload: unknown) => ({
  content: JSON.stringify(payload),
});

const LONG_RUNNING_TOOL_EXECUTION = {
  timeoutMs: null,
} as const;

type SearchToolResult = VLSearchResult & {
  rrfScore?: number;
  rerankScore?: number;
};

type BatchSearchQueryInput = {
  label?: string;
  query: string;
};

const normalizeSearchResults = (results: SearchToolResult[]) =>
  results.map((r) => ({
    resourceId: r.resourceId,
    resourceName: r.resourceName,
    hitType: r.hitType,
    chunkLevel:
      r.chunkLevel || (r.hitType === "summary" ? "summary" : "passage"),
    chapterIndex: r.chapterIndex,
    chapterTitle: r.chapterTitle,
    chapterSummary: r.chapterSummary,
    sectionTitle: r.sectionTitle,
    sectionPath: r.sectionPath,
    chunkIndex: r.chunkIndex,
    chunkIndexInSection: r.chunkIndexInSection,
    chunkStartLine: r.chunkStartLine,
    chunkEndLine: r.chunkEndLine,
    content: r.content.slice(0, 3000),
    displayContent: (r.displayContent || r.content).slice(0, 3000),
    searchContent: (r.searchContent || r.content).slice(0, 3000),
    relevanceScore: r.score,
    evidenceScore: r.evidenceScore ?? r.score,
    whyMatched:
      r.whyMatched ||
      (r.hitType === "summary"
        ? "命中摘要索引，适合作为定位线索。"
        : "命中正文内容，可继续补读上下文。"),
    rrfScore: r.rrfScore,
    rerankScore: r.rerankScore,
  }));

/**
 * 创建列出项目资源工具
 */
export const createListResourcesTool = (projectId: number): ToolDefinition => ({
  name: "list_project_resources",
  description:
    "列出当前 Vibe Learning 项目的所有上传资源。返回资源名称、类型、是否为大型分章文档及章节数等信息。大型文档（isLargeDocument=true）已按章节拆分，回答相关问题时通常应先用 read_resource_content 读取其结构索引，再决定读哪些章节。",
  parameters: {
    type: "object",
    properties: {},
  },
  executor: async () => {
    try {
      const resources: VLResource[] = await invoke(
        "vl-get-resources-by-project",
        projectId,
      );

      if (!resources || resources.length === 0) {
        return stringifyResult({
          success: true,
          message: "当前项目暂无上传资源",
          resources: [],
        });
      }

      // 格式化资源列表
      const formattedResources = resources.map((r) => ({
        name: r.name,
        type: r.resourceType,
        hasMarkdown: !!r.markdownPath,
        fileSize: r.fileSize,
        duration: r.duration,
        isLargeDocument: r.isChunked,
        chapterCount: r.chapterCount || 0,
      }));

      return stringifyResult({
        success: true,
        message: `共有 ${resources.length} 个资源`,
        resources: formattedResources,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `获取资源列表失败: ${errorMessage}`,
        resources: [],
      });
    }
  },
});

/**
 * 创建读取资源完整内容工具
 */
export const createReadResourceContentTool = (
  projectId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "read_resource_content",
  description:
    "读取指定资源的 Markdown 内容。对于小文档返回完整内容；对于大型分章文档返回结构索引/摘要索引（包含完整目录和各章节概要描述，内容很短，读取成本极低）。注意：大型文档返回的不是正文，而是帮助你建立整体结构理解的索引。",
  parameters: {
    type: "object",
    properties: {
      resourceName: {
        type: "string",
        description: "资源名称，可通过 list_project_resources 获取",
      },
    },
    required: ["resourceName"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async (args) => {
    const { resourceName } = args as { resourceName: string };

    try {
      const result = await invoke("vl-read-markdown-content", {
        projectId,
        resourceName,
        mainDbName,
      });

      if (!result.success) {
        return stringifyResult({
          success: false,
          error: result.error,
        });
      }

      return stringifyResult({
        success: true,
        resourceName: result.resourceName,
        totalLines: result.totalLines,
        isChunked: result.isChunked || false,
        contentType: result.isChunked ? "summary_index" : "full_content",
        chapterCount: result.chapterCount || 0,
        content: result.content,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `读取失败: ${errorMessage}`,
      });
    }
  },
});

/**
 * 创建按范围读取资源内容工具
 */
export const createReadResourceRangeTool = (
  projectId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "read_resource_range",
  description:
    "按行范围读取指定资源的 Markdown 内容。适用于分段读取大文件或定位到特定位置阅读。适合在全文或摘要索引已经确认资源相关后进一步补足上下文。行号从 1 开始。",
  parameters: {
    type: "object",
    properties: {
      resourceName: {
        type: "string",
        description: "资源名称，可通过 list_project_resources 获取",
      },
      startLine: {
        type: "number",
        description: "起始行号（从 1 开始）",
      },
      endLine: {
        type: "number",
        description: "结束行号（包含该行）",
      },
    },
    required: ["resourceName", "startLine", "endLine"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async (args) => {
    const { resourceName, startLine, endLine } = args as {
      resourceName: string;
      startLine: number;
      endLine: number;
    };

    try {
      const result = await invoke("vl-read-markdown-range", {
        projectId,
        resourceName,
        mainDbName,
        startLine,
        endLine,
      });

      if (!result.success) {
        return stringifyResult({
          success: false,
          error: result.error,
        });
      }

      return stringifyResult({
        success: true,
        resourceName: result.resourceName,
        startLine: result.startLine,
        endLine: result.endLine,
        totalLines: result.totalLines,
        content: result.content,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `读取失败: ${errorMessage}`,
      });
    }
  },
});

/**
 * 创建 Vibe Learning 项目专属搜索工具
 */
export const createVibeLearningSearchTool = (
  projectId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "search_project_knowledge",
  description:
    "搜索当前 Vibe Learning 项目的知识库内容。返回相关片段，并尽量标注命中属于摘要还是章节正文、所属章节及章节摘要。搜索结果只用于定位线索，不应直接当作充分证据；若需要详细解释，应继续读取命中附近上下文或章节正文。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词或问题",
      },
      limit: {
        type: "number",
        description: "返回结果数量，默认 5，最大 10",
      },
    },
    required: ["query"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async (args) => {
    const { query, limit = 5 } = args as { query: string; limit?: number };

    try {
      // 调用后端搜索
      const results = (await invoke("vl-search-content", {
        projectId,
        mainDbName,
        query,
        limit: Math.min(limit, 10),
      })) as SearchToolResult[];

      if (!results || results.length === 0) {
        return stringifyResult({
          success: true,
          message: "未找到相关内容",
          query,
          results: [],
        });
      }

      const formattedResults = normalizeSearchResults(results);

      return stringifyResult({
        success: true,
        query,
        message: `找到 ${results.length} 条相关内容`,
        results: formattedResults,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `搜索失败: ${errorMessage}`,
        results: [],
      });
    }
  },
});

export const createBatchSearchProjectKnowledgeTool = (
  projectId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "batch_search_project_knowledge",
  description:
    "对多个查询角度批量搜索当前项目知识库。适合在复杂问题中并行比较不同搜索表达。",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "查询标签，便于调用方标识该查询的策略用途",
            },
            query: {
              type: "string",
              description: "要执行的搜索问题或关键词",
            },
          },
          required: ["query"],
        },
        description:
          "需要批量执行的查询列表，每项为 { label, query }，便于调用方显式标记每个查询的用途。",
      },
      limitPerQuery: {
        type: "number",
        description: "每个查询返回数量，默认 5，最大 10",
      },
    },
    required: ["queries"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async (args) => {
    const { queries, limitPerQuery = 5 } = args as {
      queries: BatchSearchQueryInput[];
      limitPerQuery?: number;
    };
    const safeQueries = Array.isArray(queries)
      ? (queries
          .map((item) => {
            if (
              item &&
              typeof item === "object" &&
              typeof item.query === "string" &&
              item.query.trim()
            ) {
              return {
                label:
                  typeof item.label === "string" && item.label.trim()
                    ? item.label.trim()
                    : undefined,
                query: item.query.trim(),
              };
            }

            return null;
          })
          .filter(Boolean) as Array<{ label?: string; query: string }>)
      : [];

    const searches = await Promise.all(
      safeQueries.map(async ({ label, query }) => {
        const results = (await invoke("vl-search-content", {
          projectId,
          mainDbName,
          query,
          limit: Math.min(limitPerQuery, 10),
        })) as SearchToolResult[];
        return {
          label,
          query,
          results: normalizeSearchResults(results || []),
        };
      }),
    );

    return stringifyResult({
      success: true,
      searches,
    });
  },
});

export const createBatchReadSearchHitsTool = (
  projectId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "batch_read_search_hits",
  description:
    "批量读取多个搜索命中的上下文。适合在已经找到多条候选证据后，统一补读上下文。",
  parameters: {
    type: "object",
    properties: {
      hits: {
        type: "array",
        description: "搜索命中数组，每项至少包含 resourceName 和 chunkIndex",
        items: {
          type: "object",
        },
      },
    },
    required: ["hits"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async (args) => {
    const { hits } = args as {
      hits: Array<{
        resourceName: string;
        chunkIndex: number;
        radius?: number;
      }>;
    };
    const safeHits = Array.isArray(hits) ? hits : [];
    const contexts = await Promise.all(
      safeHits.map((hit) =>
        invoke("vl-read-search-hit-context", {
          projectId,
          resourceName: hit.resourceName,
          mainDbName,
          chunkIndex: hit.chunkIndex,
          radius: hit.radius,
        }),
      ),
    );

    return stringifyResult({
      success: true,
      contexts,
    });
  },
});

/**
 * 创建读取章节内容工具
 */
export const createReadResourceChapterTool = (
  projectId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "read_resource_chapter",
  description:
    "读取大型分章文档的指定章节全文。应先用 read_resource_content 或 list_resource_chapters 确定相关章节，再用此工具获取正文级证据。",
  parameters: {
    type: "object",
    properties: {
      resourceName: {
        type: "string",
        description: "资源名称，可通过 list_project_resources 获取",
      },
      chapterIndex: {
        type: "number",
        description:
          "章节索引（从 0 开始），可通过 list_resource_chapters 获取",
      },
    },
    required: ["resourceName", "chapterIndex"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async (args) => {
    const { resourceName, chapterIndex } = args as {
      resourceName: string;
      chapterIndex: number;
    };

    try {
      const result = await invoke("vl-read-chapter-content", {
        projectId,
        resourceName,
        mainDbName,
        chapterIndex,
      });

      if (!result.success) {
        return stringifyResult({
          success: false,
          error: result.error,
        });
      }

      return stringifyResult({
        success: true,
        resourceName: result.resourceName,
        chapterTitle: result.chapterTitle,
        chapterIndex: result.chapterIndex,
        totalChapters: result.totalChapters,
        content: result.content,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `读取章节失败: ${errorMessage}`,
      });
    }
  },
});

export const createReadSearchHitContextTool = (
  projectId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "read_search_hit_context",
  description:
    "读取某个搜索命中附近的上下文。适用于搜索命中后需要确认前后文、补足上下文，而又不想立刻整章通读的场景。",
  parameters: {
    type: "object",
    properties: {
      resourceName: {
        type: "string",
        description:
          "资源名称，可通过 search_project_knowledge 或 list_project_resources 获取",
      },
      chunkIndex: {
        type: "number",
        description: "搜索结果返回的 chunkIndex",
      },
      radius: {
        type: "number",
        description: "向前后扩展的 chunk 数量，默认 1，最大 3",
      },
    },
    required: ["resourceName", "chunkIndex"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async (args) => {
    const { resourceName, chunkIndex, radius } = args as {
      resourceName: string;
      chunkIndex: number;
      radius?: number;
    };

    try {
      const result = await invoke("vl-read-search-hit-context", {
        projectId,
        resourceName,
        mainDbName,
        chunkIndex,
        radius,
      });

      if (!result.success) {
        return stringifyResult({
          success: false,
          error: result.error,
        });
      }

      return stringifyResult({
        success: true,
        resourceName: result.resourceName,
        hitType: result.hitType,
        chapterIndex: result.chapterIndex,
        chapterTitle: result.chapterTitle,
        chunkIndex: result.chunkIndex,
        chunkIndexInSection: result.chunkIndexInSection,
        startChunkIndex: result.startChunkIndex,
        endChunkIndex: result.endChunkIndex,
        content: result.content,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `读取命中上下文失败: ${errorMessage}`,
      });
    }
  },
});

export const createReadResourceChapterRangeTool = (
  projectId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "read_resource_chapter_range",
  description:
    "按行范围读取大型分章文档的指定章节内容。适用于章节较长时的分段深读，或在已经确定章节相关后只补读局部正文。",
  parameters: {
    type: "object",
    properties: {
      resourceName: {
        type: "string",
        description: "资源名称，可通过 list_project_resources 获取",
      },
      chapterIndex: {
        type: "number",
        description: "章节索引（从 0 开始）",
      },
      startLine: {
        type: "number",
        description: "起始行号（从 1 开始）",
      },
      endLine: {
        type: "number",
        description: "结束行号（包含该行）",
      },
    },
    required: ["resourceName", "chapterIndex", "startLine", "endLine"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async (args) => {
    const { resourceName, chapterIndex, startLine, endLine } = args as {
      resourceName: string;
      chapterIndex: number;
      startLine: number;
      endLine: number;
    };

    try {
      const result = await invoke("vl-read-chapter-range", {
        projectId,
        resourceName,
        mainDbName,
        chapterIndex,
        startLine,
        endLine,
      });

      if (!result.success) {
        return stringifyResult({
          success: false,
          error: result.error,
        });
      }

      return stringifyResult({
        success: true,
        resourceName: result.resourceName,
        chapterTitle: result.chapterTitle,
        chapterIndex: result.chapterIndex,
        startLine: result.startLine,
        endLine: result.endLine,
        totalLines: result.totalLines,
        content: result.content,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `读取章节片段失败: ${errorMessage}`,
      });
    }
  },
});

/**
 * 创建列出章节工具
 */
export const createListResourceChaptersTool = (
  projectId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "list_resource_chapters",
  description:
    "列出大型分章文档的所有章节标题、摘要和索引。用于建立结构理解，并决定下一步该读取哪些章节正文。",
  parameters: {
    type: "object",
    properties: {
      resourceName: {
        type: "string",
        description: "资源名称，可通过 list_project_resources 获取",
      },
    },
    required: ["resourceName"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async (args) => {
    const { resourceName } = args as { resourceName: string };

    try {
      const result = await invoke("vl-list-chapters", {
        projectId,
        resourceName,
        mainDbName,
      });

      if (!result.success) {
        return stringifyResult({
          success: false,
          error: result.error,
        });
      }

      return stringifyResult({
        success: true,
        resourceName: result.resourceName,
        chapters: result.chapters,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `列出章节失败: ${errorMessage}`,
      });
    }
  },
});

export default createVibeLearningSearchTool;
