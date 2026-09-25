import { useEffect } from "react";
import toolRegistry from "@/tools";
import { createUnifiedVibeLearningTool } from "@/tools/vibeLearningSearchTool";

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
 * - vibe_learning_query: 统一执行项目资源列出、搜索和范围补读
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
    const tools = [createUnifiedVibeLearningTool(projectId, mainDbName)];

    toolRegistry.registerTools(sourceId, tools, true);

    // 清理工具
    return () => {
      toolRegistry.unregisterSource(sourceId);
    };
  }, [enabled, projectId, mainDbName, sourceId]);
};

export default useVLTools;
