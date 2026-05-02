import { useEffect } from "react";
import toolRegistry from "@/tools";
import {
  createBatchReadSearchHitsTool,
  createBatchSearchProjectKnowledgeTool,
  createVibeLearningSearchTool,
  createListResourcesTool,
  createReadResourceContentTool,
  createReadResourceRangeTool,
  createReadResourceChapterTool,
  createReadSearchHitContextTool,
  createReadResourceChapterRangeTool,
  createListResourceChaptersTool,
} from "@/tools/vibeLearningSearchTool";

export interface UseVLToolsOptions {
  /** 项目 ID */
  projectId: number;
  /** 主数据库名称 */
  mainDbName: string;
  /** 工具注册的唯一标识，如 "quiz-generation-{projectId}" */
  sourceId: string;
  /** 是否启用工具，默认 true */
  enabled?: boolean;
}

/**
 * VibeLearning 工具注册 Hook
 *
 * 自动注册和清理 VibeLearning 专属工具：
 * - list_project_resources: 列出项目资源
 * - read_resource_content: 读取资源完整内容
 * - read_resource_range: 分段读取资源内容
 * - read_resource_chapter: 读取章节全文
 * - read_search_hit_context: 读取命中上下文
 * - read_resource_chapter_range: 分段读取章节正文
 * - list_resource_chapters: 查看章节列表与摘要
 * - search_project_knowledge: 搜索项目知识库
 * - batch_search_project_knowledge: 批量执行多个搜索角度
 * - batch_read_search_hits: 批量补读命中上下文
 *
 * @example
 * ```tsx
 * useVLTools({
 *   projectId: 123,
 *   mainDbName: "main.db",
 *   sourceId: `quiz-generation-${projectId}`,
 *   enabled: open, // 弹窗打开时启用
 * });
 * ```
 */
const useVLTools = (options: UseVLToolsOptions): void => {
  const { projectId, mainDbName, sourceId, enabled = true } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // 注册 VibeLearning 专属工具
    const tools = [
      createVibeLearningSearchTool(projectId, mainDbName),
      createBatchSearchProjectKnowledgeTool(projectId, mainDbName),
      createListResourcesTool(projectId),
      createReadResourceContentTool(projectId, mainDbName),
      createReadResourceRangeTool(projectId, mainDbName),
      createReadResourceChapterTool(projectId, mainDbName),
      createReadSearchHitContextTool(projectId, mainDbName),
      createReadResourceChapterRangeTool(projectId, mainDbName),
      createListResourceChaptersTool(projectId, mainDbName),
      createBatchReadSearchHitsTool(projectId, mainDbName),
    ];

    toolRegistry.registerTools(sourceId, tools, true);

    // 清理工具
    return () => {
      toolRegistry.unregisterSource(sourceId);
    };
  }, [enabled, projectId, mainDbName, sourceId]);
};

export default useVLTools;
