import type { ToolDefinition } from "@/types/tool";
import {
  getVLResourcesByProjectId,
  grepVLResourceContent,
  readVLResourceContent,
  readVLResourceLines,
  readVLResourceRange,
  searchVLContent,
} from "@/commands";

import type { VLResource, VLSearchResult } from "@/types/vibe-learning";

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

type BatchReadSearchHitInput = {
  resourceId?: number;
  resourceName?: string;
  startOffset?: number;
  endOffset?: number;
  contextChars?: number;
  chunkStartLine?: number;
  chunkEndLine?: number;
  lineNumber?: number;
  contextLines?: number;
};

const normalizeSearchResults = (results: SearchToolResult[]) =>
  results.map(r => ({
    resourceId: r.resourceId,
    resourceName: r.resourceName,
    chunkLevel: r.chunkLevel || "passage",
    chunkIndex: r.chunkIndex,
    chunkStartLine: r.chunkStartLine,
    chunkEndLine: r.chunkEndLine,
    startOffset: r.startOffset,
    endOffset: r.endOffset,
    charCount: r.charCount,
    content: r.content.slice(0, 3000),
    displayContent: (r.displayContent || r.content).slice(0, 3000),
    searchContent: (r.searchContent || r.content).slice(0, 3000),
    relevanceScore: r.score,
    evidenceScore: r.evidenceScore ?? r.score,
    whyMatched: r.whyMatched || "命中正文内容，可继续补读上下文。",
    rrfScore: r.rrfScore,
    rerankScore: r.rerankScore,
  }));

/**
 * 创建列出项目资源工具
 */
export const createListResourcesTool = (projectId: number): ToolDefinition => ({
  name: "list_project_resources",
  description:
    "列出当前 Vibe Learning 项目的所有上传资源。返回资源 ID、名称、类型、是否已有 Markdown 等信息。后续读取应优先使用 resourceId，资源重命名后仍稳定。",
  parameters: {
    type: "object",
    properties: {},
  },
  executor: async () => {
    try {
      const resources: VLResource[] = await getVLResourcesByProjectId(projectId);

      if (!resources || resources.length === 0) {
        return stringifyResult({
          success: true,
          message: "当前项目暂无上传资源",
          resources: [],
        });
      }

      // 格式化资源列表
      const formattedResources = resources.map(r => ({
        resourceId: r.id,
        name: r.name,
        type: r.resourceType,
        hasMarkdown: !!r.markdownPath,
        fileSize: r.fileSize,
        duration: r.duration,
      }));

      return stringifyResult({
        success: true,
        message: `共有 ${resources.length} 个资源`,
        resources: formattedResources,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
  mainDbName: string
): ToolDefinition => ({
  name: "read_resource_content",
  description:
    "读取指定资源的 Markdown 内容。长文档会被默认截断；需要精确上下文时，先用 search_resource_content 或 grep_resource_content 定位，再用 read_resource_lines/read_resource_range 补读。",
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
  executor: async args => {
    const { resourceName } = args as { resourceName: string };

    try {
      const result = await readVLResourceContent(projectId, resourceName, mainDbName);

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
        contentType: "markdown",
        content: result.content,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `读取失败: ${errorMessage}`,
      });
    }
  },
});

export const createReadResourceLinesTool = (
  projectId: number,
  mainDbName: string
): ToolDefinition => ({
  name: "read_resource_lines",
  description:
    "按行号范围读取指定资源的 Markdown 内容。适合根据 search_resource_content 返回的 chunkStartLine/chunkEndLine 或 grep_resource_content 返回的 lineNumber 补读上下文。行号从 1 开始。",
  parameters: {
    type: "object",
    properties: {
      resourceId: {
        type: "number",
        description: "资源 ID，优先使用 search/grep/list 返回的 resourceId",
      },
      resourceName: {
        type: "string",
        description: "资源名称，兼容旧调用；优先使用 resourceId",
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
    required: ["startLine", "endLine"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async args => {
    const { resourceId, resourceName, startLine, endLine } = args as {
      resourceId?: number;
      resourceName?: string;
      startLine: number;
      endLine: number;
    };

    try {
      const result = await readVLResourceLines({
        projectId,
        resourceId,
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
        resourceId: result.resourceId,
        resourceName: result.resourceName,
        startLine: result.startLine,
        endLine: result.endLine,
        totalLines: result.totalLines,
        truncated: result.truncated || false,
        content: result.content,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `读取失败: ${errorMessage}`,
      });
    }
  },
});

export const createReadResourceRangeTool = (
  projectId: number,
  mainDbName: string
): ToolDefinition => ({
  name: "read_resource_range",
  description:
    "按字符范围读取指定资源的 Markdown 内容。适合根据 search_resource_content 或 grep_resource_content 返回的 startOffset/endOffset 精确补读上下文。",
  parameters: {
    type: "object",
    properties: {
      resourceId: {
        type: "number",
        description: "资源 ID，优先使用 search/grep/list 返回的 resourceId",
      },
      resourceName: {
        type: "string",
        description: "资源名称，兼容旧调用；优先使用 resourceId",
      },
      startOffset: {
        type: "number",
        description: "起始字符位置（包含）",
      },
      endOffset: {
        type: "number",
        description: "结束字符位置（不包含）",
      },
    },
    required: ["startOffset", "endOffset"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async args => {
    const { resourceId, resourceName, startOffset, endOffset } = args as {
      resourceId?: number;
      resourceName?: string;
      startOffset: number;
      endOffset: number;
    };

    try {
      const result = await readVLResourceRange({
        projectId,
        resourceId,
        resourceName,
        mainDbName,
        startOffset,
        endOffset,
      });

      if (!result.success) {
        return stringifyResult({
          success: false,
          error: result.error,
        });
      }

      return stringifyResult({
        success: true,
        resourceId: result.resourceId,
        resourceName: result.resourceName,
        startOffset: result.startOffset,
        endOffset: result.endOffset,
        totalChars: result.totalChars,
        truncated: result.truncated || false,
        content: result.content,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
  mainDbName: string
): ToolDefinition => ({
  name: "search_resource_content",
  description:
    "语义搜索当前 Vibe Learning 项目的资源内容。返回相关 chunk 及其 resourceId、chunkIndex、行号范围和字符范围。搜索结果用于定位线索，回答前通常应再用 read_resource_lines 或 read_resource_range 补读上下文。",
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
  executor: async args => {
    const { query, limit = 5 } = args as { query: string; limit?: number };

    try {
      // 调用后端搜索
      const results = (await searchVLContent({
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `搜索失败: ${errorMessage}`,
        results: [],
      });
    }
  },
});

export const createGrepResourceContentTool = (
  projectId: number,
  mainDbName: string
): ToolDefinition => ({
  name: "grep_resource_content",
  description:
    "使用 ripgrep 在当前 Vibe Learning 项目的本地 Markdown 资源中做精确文本或正则搜索。返回精确匹配的 resourceId、lineNumber、startOffset/endOffset、matchedText 和 preview。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "要搜索的关键词或正则表达式",
      },
      isRegex: {
        type: "boolean",
        description: "是否按正则表达式搜索；false 时按固定字符串搜索",
      },
      ignoreCase: {
        type: "boolean",
        description: "是否忽略大小写",
      },
      limit: {
        type: "number",
        description: "返回结果数量，默认 20，最大 100",
      },
    },
    required: ["query"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async args => {
    const {
      query,
      isRegex = false,
      ignoreCase = false,
      limit = 20,
    } = args as {
      query: string;
      isRegex?: boolean;
      ignoreCase?: boolean;
      limit?: number;
    };

    try {
      const result = await grepVLResourceContent({
        projectId,
        mainDbName,
        query,
        isRegex,
        ignoreCase,
        limit,
      });
      return stringifyResult(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return stringifyResult({
        success: false,
        error: `grep 查询失败: ${errorMessage}`,
        results: [],
      });
    }
  },
});

export const createBatchSearchProjectKnowledgeTool = (
  projectId: number,
  mainDbName: string
): ToolDefinition => ({
  name: "batch_search_project_knowledge",
  description: "对多个查询角度批量搜索当前项目知识库。适合在复杂问题中并行比较不同搜索表达。",
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
  executor: async args => {
    const { queries, limitPerQuery = 5 } = args as {
      queries: BatchSearchQueryInput[];
      limitPerQuery?: number;
    };
    const safeQueries = Array.isArray(queries)
      ? (queries
          .map(item => {
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
        const results = (await searchVLContent({
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
      })
    );

    return stringifyResult({
      success: true,
      searches,
    });
  },
});

export const createBatchReadSearchHitsTool = (
  projectId: number,
  mainDbName: string
): ToolDefinition => ({
  name: "batch_read_search_hits",
  description:
    "批量读取多个搜索命中的上下文。优先根据 startOffset/endOffset 按字符范围补读；缺少字符范围时根据 chunkStartLine/chunkEndLine 或 lineNumber 按行范围补读。",
  parameters: {
    type: "object",
    properties: {
      hits: {
        type: "array",
        description:
          "搜索命中数组。每项应包含 resourceId 或 resourceName，并提供 startOffset/endOffset 或 chunkStartLine/chunkEndLine/lineNumber。",
        items: {
          type: "object",
        },
      },
    },
    required: ["hits"],
  },
  execution: LONG_RUNNING_TOOL_EXECUTION,
  executor: async args => {
    const { hits } = args as {
      hits: BatchReadSearchHitInput[];
    };
    const safeHits = Array.isArray(hits) ? hits : [];
    const contexts = await Promise.all(
      safeHits.map(async hit => {
        const contextChars = Math.max(0, Math.floor(hit.contextChars ?? 500));
        if (typeof hit.startOffset === "number" && typeof hit.endOffset === "number") {
          return readVLResourceRange({
            projectId,
            resourceId: hit.resourceId,
            resourceName: hit.resourceName,
            mainDbName,
            startOffset: Math.max(0, Math.floor(hit.startOffset - contextChars)),
            endOffset: Math.max(
              Math.floor(hit.startOffset),
              Math.floor(hit.endOffset + contextChars)
            ),
          });
        }

        const contextLines = Math.max(0, Math.floor(hit.contextLines ?? 3));
        const startLine =
          typeof hit.chunkStartLine === "number" ? hit.chunkStartLine : hit.lineNumber;
        const endLine = typeof hit.chunkEndLine === "number" ? hit.chunkEndLine : startLine;

        if (typeof startLine === "number" && typeof endLine === "number") {
          return readVLResourceLines({
            projectId,
            resourceId: hit.resourceId,
            resourceName: hit.resourceName,
            mainDbName,
            startLine: Math.max(1, Math.floor(startLine - contextLines)),
            endLine: Math.max(Math.floor(startLine), Math.floor(endLine + contextLines)),
          });
        }

        return {
          success: false,
          resourceId: hit.resourceId,
          resourceName: hit.resourceName,
          error: "缺少可补读的字符范围或行范围",
        };
      })
    );

    return stringifyResult({
      success: true,
      contexts,
    });
  },
});

export default createVibeLearningSearchTool;

/** 将项目资料的列出、搜索、定位和补读收敛为一个按 operation 分派的工具。 */
export const createUnifiedVibeLearningTool = (
  projectId: number,
  mainDbName: string
): ToolDefinition => {
  const operations = {
    list: createListResourcesTool(projectId),
    read: createReadResourceContentTool(projectId, mainDbName),
    read_lines: createReadResourceLinesTool(projectId, mainDbName),
    read_range: createReadResourceRangeTool(projectId, mainDbName),
    search: createVibeLearningSearchTool(projectId, mainDbName),
    grep: createGrepResourceContentTool(projectId, mainDbName),
    batch_search: createBatchSearchProjectKnowledgeTool(projectId, mainDbName),
    batch_read: createBatchReadSearchHitsTool(projectId, mainDbName),
  } as const;

  return {
    name: "vibe_learning_query",
    description:
      "统一查询当前 Vibe Learning 项目资料。operation 可选 list、search、grep、read、read_lines、read_range、batch_search、batch_read；具体参数放在 input 中，先搜索定位，再按命中范围补读原文。",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: Object.keys(operations),
          description: "要执行的资料操作。",
        },
        input: {
          type: "object",
          additionalProperties: true,
          description: "对应 operation 的参数对象。",
        },
      },
      required: ["operation"],
      additionalProperties: false,
    },
    execution: LONG_RUNNING_TOOL_EXECUTION,
    executor: async args => {
      const operation = args.operation as keyof typeof operations;
      const selected = operations[operation];
      if (!selected) {
        return {
          content: JSON.stringify({
            success: false,
            error: `不支持的 operation: ${String(args.operation)}`,
          }),
        };
      }
      return selected.executor((args.input as Record<string, unknown> | undefined) ?? {});
    },
  };
};
