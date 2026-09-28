const SUBAGENT_RESEARCH_TOOL_NAME = "subagent_research";

/** 子代理可用工具名白名单判定（防递归：不允许子代理再派生子代理） */
export const isAllowedSubAgentToolName = (toolName: string): boolean =>
  toolName.trim().toLowerCase() !== SUBAGENT_RESEARCH_TOOL_NAME;
