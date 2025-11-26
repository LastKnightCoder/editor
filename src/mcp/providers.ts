import dayjs from "dayjs";
import type {
  StatisticData,
  ToolDefinition,
  ToolParameterSchema,
} from "@/types";
import { getStatisticByDateAndType, getAllCards } from "@/commands";

export interface MCPProviderDefinition {
  id: string;
  name: string;
  description: string;
  defaultEnabled?: boolean;
  tools: () => ToolDefinition[];
}

const asStatisticEntry = (
  input: StatisticData | StatisticData[] | null | undefined,
): StatisticData | null => {
  if (!input) {
    return null;
  }
  if (Array.isArray(input)) {
    return input[0] ?? null;
  }
  return input;
};

export const MCP_PROVIDERS: MCPProviderDefinition[] = [
  {
    id: "card-statistics",
    name: "卡片统计 MCP",
    description: "提供关于卡片数量及每日变动情况的查询工具。",
    defaultEnabled: true,
    tools: () => [
      {
        name: "get_card_count",
        description: "返回当前卡片总数以及累计字数。",
        parameters: {
          type: "object",
          properties: {} as Record<string, ToolParameterSchema>,
          required: [],
          additionalProperties: false,
        },
        executor: async () => {
          const cards = await getAllCards();
          return {
            content: JSON.stringify({
              count: cards.length,
              wordsCount: cards.reduce((acc, card) => acc + card.count, 0),
            }),
          };
        },
      },
      {
        name: "get_card_daily_summary",
        description:
          "根据日期返回卡片更新情况，例如新增或更新的数量以及字数变化。",
        parameters: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description: "目标日期，格式 YYYY-MM-DD，例如 2025-01-01。",
            },
          } as Record<string, ToolParameterSchema>,
          required: [],
          additionalProperties: false,
        },
        executor: async (args) => {
          const targetDate =
            typeof args.date === "string" && args.date.trim().length > 0
              ? args.date
              : dayjs().format("YYYY-MM-DD");
          const stats = asStatisticEntry(
            await getStatisticByDateAndType(targetDate, "card").catch(
              () => null,
            ),
          );
          if (!stats) {
            return `未找到 ${targetDate} 的卡片统计数据`;
          }
          return {
            content: JSON.stringify({
              date: stats.date,
              count: stats.content?.count ?? 0,
              wordsCount: stats.content?.wordsCount ?? 0,
            }),
          };
        },
      },
    ],
  },
];
