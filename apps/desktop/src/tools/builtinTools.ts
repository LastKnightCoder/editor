import dayjs from "dayjs";
import { skillToolsProvider } from "@/mcp/providers/skill-tools";
import type { ToolRegistry } from "./toolRegistry";
import { createAskQuestionTool } from "./askQuestionTool";
import { createKnowledgeSearchTool } from "./knowledgeSearchTool";

export const BUILTIN_SOURCE = "builtin";

export const registerBuiltinTools = (registry: ToolRegistry) => {
  registry.registerTools(
    BUILTIN_SOURCE,
    [
      createAskQuestionTool(),
      createKnowledgeSearchTool(),
      {
        name: "get_current_date",
        description: "返回今天的日期信息，包括 ISO 格式、简短日期以及星期几。",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        executor: async () => {
          const now = dayjs();
          return {
            content: JSON.stringify({
              iso: now.toISOString(),
              date: now.format("YYYY-MM-DD"),
              weekday: now.format("dddd"),
              timestamp: now.valueOf(),
            }),
          };
        },
      },
      ...skillToolsProvider.tools(),
    ],
    true,
  );
};
