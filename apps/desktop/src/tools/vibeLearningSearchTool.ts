import type { ToolDefinition } from "@/types/tool";
import type { VLResource } from "@/types/vibe-learning";
import { invoke } from "@/electron";

/**
 * 创建列出项目资源工具
 */
export const createListResourcesTool = (projectId: number): ToolDefinition => ({
  name: "list_project_resources",
  description:
    "列出当前 Vibe Learning 项目的所有上传资源。返回资源名称、类型等信息，可用于了解项目中有哪些资料。",
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
        return {
          content: JSON.stringify({
            success: true,
            message: "当前项目暂无上传资源",
            resources: [],
          }),
        };
      }

      // 格式化资源列表
      const formattedResources = resources.map((r) => ({
        name: r.name,
        type: r.resourceType,
        hasMarkdown: !!r.markdownPath,
        fileSize: r.fileSize,
        duration: r.duration,
      }));

      return {
        content: JSON.stringify({
          success: true,
          message: `共有 ${resources.length} 个资源`,
          resources: formattedResources,
        }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: JSON.stringify({
          success: false,
          error: `获取资源列表失败: ${errorMessage}`,
          resources: [],
        }),
      };
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
    "读取指定资源的完整 Markdown 内容。适用于需要查看资源全部内容的场景。如果内容过长会被截断，可使用 read_resource_range 分段读取。",
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
  executor: async (args) => {
    const { resourceName } = args as { resourceName: string };

    try {
      const result = await invoke("vl-read-markdown-content", {
        projectId,
        resourceName,
        mainDbName,
      });

      if (!result.success) {
        return {
          content: JSON.stringify({
            success: false,
            error: result.error,
          }),
        };
      }

      return {
        content: JSON.stringify({
          success: true,
          resourceName: result.resourceName,
          totalLines: result.totalLines,
          content: result.content,
        }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: JSON.stringify({
          success: false,
          error: `读取失败: ${errorMessage}`,
        }),
      };
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
    "按行范围读取指定资源的 Markdown 内容。适用于分段读取大文件或定位到特定位置阅读。行号从 1 开始。",
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
        return {
          content: JSON.stringify({
            success: false,
            error: result.error,
          }),
        };
      }

      return {
        content: JSON.stringify({
          success: true,
          resourceName: result.resourceName,
          startLine: result.startLine,
          endLine: result.endLine,
          totalLines: result.totalLines,
          content: result.content,
        }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: JSON.stringify({
          success: false,
          error: `读取失败: ${errorMessage}`,
        }),
      };
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
    "搜索当前 Vibe Learning 项目的知识库内容。根据用户的问题或关键词，从上传的资料中查找相关信息。",
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
  executor: async (args) => {
    const { query, limit = 5 } = args as { query: string; limit?: number };

    try {
      // 调用后端搜索
      const results = await invoke("vl-search-content", {
        projectId,
        mainDbName,
        query,
        limit: Math.min(limit, 10),
      });

      if (!results || results.length === 0) {
        return {
          content: JSON.stringify({
            success: true,
            message: "未找到相关内容",
            results: [],
          }),
        };
      }

      // 格式化结果
      const formattedResults = results.map(
        (r: {
          resourceId: number;
          resourceName: string;
          content: string;
          score: number;
        }) => ({
          resourceName: r.resourceName,
          content: r.content.slice(0, 1000), // 限制内容长度
          relevanceScore: r.score,
        }),
      );

      return {
        content: JSON.stringify({
          success: true,
          message: `找到 ${results.length} 条相关内容`,
          results: formattedResults,
        }),
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

export default createVibeLearningSearchTool;
