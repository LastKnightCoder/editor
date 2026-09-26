import type { AgentTool } from "@tau/agent";

import toolRegistry from "@/tools";

const BUILTIN_SKILL_TOOL_NAMES = new Set([
  "list_skills",
  "get_skill_readme",
  "get_skill_tree",
  "read_skill_file",
]);

export const getToolRegistryAgentTools = (options?: {
  includeBuiltinSkillTools?: boolean;
  /** 对话的工具作用域：带上该作用域注册的页面专属工具（同名时覆盖全局） */
  toolScope?: string;
}): AgentTool[] => {
  const scoped = toolRegistry.getScopedTools(options?.toolScope);
  const scopedNames = new Set(scoped.map(tool => tool.name));
  return [
    ...toolRegistry.getRegisteredTools().filter(tool => !scopedNames.has(tool.name)),
    ...scoped,
  ]
    .filter(tool => tool.enabled)
    .filter(tool => options?.includeBuiltinSkillTools || !BUILTIN_SKILL_TOOL_NAMES.has(tool.name))
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      source: tool.source,
      parameters: tool.parameters,
      execution: tool.execution,
      risk: tool.risk,
      execute: tool.executor,
    }));
};
