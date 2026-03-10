import type { MCPProviderDefinition } from "./types";
import { buildQuestionGroupTools } from "./question-tools/group-tools";
import { buildQuestionItemTools } from "./question-tools/item-tools";
import { buildQuestionQueryTools } from "./question-tools/query-tools";

export const questionToolsProvider: MCPProviderDefinition = {
  id: "question-tools",
  name: "问题管理工具",
  description:
    "提供问题管理的总览查询、分组管理、问题增删改查、状态流转和答案关联操作。",
  defaultEnabled: true,
  tools: () => [
    ...buildQuestionQueryTools(),
    ...buildQuestionGroupTools(),
    ...buildQuestionItemTools(),
  ],
};
