import type { AiToolExecutionContext, AiToolResult, AiToolRisk } from "@tau/ai/contracts";

/** 宿主工具：工具名与桌面同名，模型看到的就是 name；id 带来源前缀以区分插件工具 */
export interface HostTool {
  name: string;
  risk: AiToolRisk;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: Record<string, unknown>, context: AiToolExecutionContext): Promise<AiToolResult>;
}

export const HOST_TOOL_SOURCE = "host";
export const hostToolId = (name: string) => `${HOST_TOOL_SOURCE}:${name}`;

/** 宿主工具按功能分组，供管理页整组开关；ask-question 属于对话交互，不分组、不可关 */
export const HOST_TOOL_GROUPS = [
  {
    id: "host:knowledge",
    name: "笔记与搜索",
    description: "检索、阅读笔记，按只读 SQL 查询数据库",
    tools: ["get_current_date", "search_knowledge", "get_content_markdown", "sql_query"],
  },
  {
    id: "host:tasks",
    name: "待办与日程",
    description: "查询、创建、修改独立待办与日程。正文里的待办暂不支持",
    tools: [
      "query_todos",
      "query_calendar_events",
      "create_todo",
      "update_todo",
      "set_todo_completed",
      "delete_todo",
      "create_calendar_event",
      "update_calendar_event",
      "delete_calendar_event",
    ],
  },
  {
    id: "host:images",
    name: "图片生成",
    description: "用「图片生成」里选用的插件生成或编辑图片",
    tools: ["generate_image", "edit_image"],
  },
] as const;

/** 工具分组身份：宿主工具取所属功能组，其他工具取注册时的 sourceId */
export function toolSourceOf(tool: { name: string; sourceId: string }) {
  if (tool.sourceId !== HOST_TOOL_SOURCE) return tool.sourceId;
  return (
    HOST_TOOL_GROUPS.find(group => (group.tools as readonly string[]).includes(tool.name))?.id ??
    tool.sourceId
  );
}

export const ok = (value: unknown, metadata?: Record<string, unknown>): AiToolResult => ({
  content: JSON.stringify(value),
  ...(metadata ? { metadata } : {}),
});

/** 工具层错误以结构化结果回给模型，便于其修正后重试；不抛出成运行失败 */
export const failure = (code: string, message: string, extra?: Record<string, unknown>) =>
  ok({ success: false, errorCode: code, message, ...extra });

export const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const text = (input: Record<string, unknown>, key: string) =>
  typeof input[key] === "string" ? (input[key] as string) : undefined;

export const integer = (input: Record<string, unknown>, key: string) => {
  const value = input[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
};
