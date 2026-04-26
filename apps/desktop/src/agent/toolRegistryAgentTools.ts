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
}): AgentTool[] =>
  toolRegistry
    .getRegisteredTools()
    .filter((tool) => tool.enabled)
    .filter(
      (tool) =>
        options?.includeBuiltinSkillTools ||
        !BUILTIN_SKILL_TOOL_NAMES.has(tool.name),
    )
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      source: tool.source,
      parameters: tool.parameters,
      execute: tool.executor,
    }));
