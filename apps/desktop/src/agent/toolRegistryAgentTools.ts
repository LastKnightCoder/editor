import toolRegistry from "@/tools";
import type { ToolDefinition, ToolExecutor } from "@/types";

const BUILTIN_SKILL_TOOL_NAMES = new Set([
  "list_skills",
  "get_skill_readme",
  "get_skill_tree",
  "read_skill_file",
]);

/** 带启用态的工具（includeDisabled 时用于「注册全集 + 活跃子集」的会话装配） */
export type RegistryAgentTool = Omit<ToolDefinition, "executor"> & {
  source: string;
  execute: ToolExecutor;
  enabled: boolean;
};

export const getToolRegistryAgentTools = (options?: {
  includeBuiltinSkillTools?: boolean;
  /** 对话的工具作用域：带上该作用域注册的页面专属工具（同名时覆盖全局） */
  toolScope?: string;
  /**
   * 连当前停用的工具一起返回（带 enabled 标记）。pi 会话的工具注册表装配后不可追加，
   * 交全集注册、只切活跃子集，用户开关工具时就不必重建会话（见 D-060/M3-c）。
   */
  includeDisabled?: boolean;
}): RegistryAgentTool[] => {
  const scoped = toolRegistry.getScopedTools(options?.toolScope);
  const scopedNames = new Set(scoped.map(tool => tool.name));
  return [
    ...toolRegistry.getRegisteredTools().filter(tool => !scopedNames.has(tool.name)),
    ...scoped,
  ]
    .filter(tool => options?.includeDisabled || tool.enabled)
    .filter(tool => options?.includeBuiltinSkillTools || !BUILTIN_SKILL_TOOL_NAMES.has(tool.name))
    .map(tool => ({
      name: tool.name,
      executionIdentity: tool.executionIdentity,
      description: tool.description,
      source: tool.source,
      parameters: tool.parameters,
      execution: tool.execution,
      risk: tool.risk,
      execute: tool.executor,
      enabled: tool.enabled,
    }));
};
