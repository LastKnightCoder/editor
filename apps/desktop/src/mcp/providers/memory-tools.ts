import type { ToolParameterSchema } from "@/types";
import { getMemorySourceContext, searchMemory } from "@/commands/memory";
import type { MCPProviderDefinition } from "./types";

export const memoryToolsProvider: MCPProviderDefinition = {
  id: "memory-tools",
  name: "记忆工具",
  description: "提供长期记忆检索、事实查询和源上下文读取能力",
  defaultEnabled: true,
  tools: () => [
    {
      name: "memory_search",
      description:
        '搜索当前数据库对应的长期记忆 sidecar。适合查询过去的讨论、决策背景、历史日记内容和原文证据。该工具现在只做语义搜索。查日记时优先传 sourceTypes:["diary"]，并把日期或时间范围直接写进 query，例如：1) 查询某天日记：{"query":"2026-04-07 4月7日 日记 做了什么","sourceTypes":["diary"]}；2) 查询某段时间的日记：{"query":"2026年4月上旬 日记 做了什么","sourceTypes":["diary"]}；3) 按主题查日记：{"query":"最近关于记忆系统的反思 日记","sourceTypes":["diary"]}。如果需要聊天历史而不是日记，传 sourceTypes:["chat"]；如果两者都可能相关，可以不传 sourceTypes。',
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "要检索的记忆查询语句",
          },
          sourceTypes: {
            type: "array",
            items: {
              type: "string",
              enum: ["chat", "diary"],
            },
            description: "可选，限制来源类型",
          },
          limit: {
            type: "number",
            description: "可选，返回条数，默认 5",
          },
          room: {
            type: "string",
            description: "可选，限制 room",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["query"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const result = await searchMemory({
          query: String(args.query || ""),
          sourceTypes: Array.isArray(args.sourceTypes)
            ? (args.sourceTypes as Array<"chat" | "diary">)
            : undefined,
          limit:
            typeof args.limit === "number" ? (args.limit as number) : undefined,
          room:
            typeof args.room === "string" ? (args.room as string) : undefined,
        });
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
    {
      name: "memory_get_source_context",
      description:
        "根据 memory_search 返回的 sourceType/sourceId 读取当前业务数据库中的完整源上下文。",
      parameters: {
        type: "object",
        properties: {
          sourceType: {
            type: "string",
            enum: ["chat", "diary"],
            description: "来源类型",
          },
          sourceId: {
            type: "number",
            description: "来源记录 ID",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["sourceType", "sourceId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const result = await getMemorySourceContext({
          sourceType: args.sourceType as "chat" | "diary",
          sourceId: Number(args.sourceId),
        });
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
  ],
};
