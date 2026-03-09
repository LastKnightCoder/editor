import type { MCPProviderDefinition } from "./types";
import { buildTodoCalendarTools } from "./todo-tools/calendar-tools";
import { buildTodoGroupTools } from "./todo-tools/group-tools";
import { buildTodoItemTools } from "./todo-tools/item-tools";
import { buildTodoNoteTools } from "./todo-tools/note-tools";
import { buildTodoQueryTools } from "./todo-tools/query-tools";
import { buildTodoRecurrenceTools } from "./todo-tools/recurrence-tools";

export const todoToolsProvider: MCPProviderDefinition = {
  id: "todo-tools",
  name: "任务列表工具",
  description:
    "提供任务列表的组合查询、统计摘要、分组与任务增删改查、周期、笔记关联和日历映射操作。",
  defaultEnabled: true,
  tools: () => [
    ...buildTodoQueryTools(),
    ...buildTodoGroupTools(),
    ...buildTodoItemTools(),
    ...buildTodoRecurrenceTools(),
    ...buildTodoNoteTools(),
    ...buildTodoCalendarTools(),
  ],
};
