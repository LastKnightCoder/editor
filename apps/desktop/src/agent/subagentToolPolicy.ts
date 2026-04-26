import type { AgentTool } from "@tau/agent";

const SUBAGENT_RESEARCH_TOOL_NAME = "subagent_research";

export const isAllowedSubAgentToolName = (toolName: string): boolean =>
  toolName.trim().toLowerCase() !== SUBAGENT_RESEARCH_TOOL_NAME;

export const filterSubAgentTools = (tools: AgentTool[]): AgentTool[] =>
  tools.filter((tool) => isAllowedSubAgentToolName(tool.name));
