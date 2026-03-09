import type { ToolDefinition } from "@/types";
import type { TodoQueryRequest } from "@/types";
import { executeTodoQuery, getTodoDashboardData } from "@/mcp/todo/query";
import { toJson, todoQuerySchema } from "./shared";

export const buildTodoQueryTools = (): ToolDefinition[] => [
  {
    name: "query_todos",
    description:
      "查询任务列表。支持按分组 ID、分组名称、任务类型、完成状态、逾期状态、层级关系、时间范围和关键字做组合筛选，并可按分组或状态等方式返回结果。用户明确提到组名时优先使用 groupNames；keyword 仅用于模糊搜索。",
    parameters: todoQuerySchema,
    executor: async (args) => {
      return toJson(await executeTodoQuery(args as TodoQueryRequest));
    },
  },
  {
    name: "get_todo_dashboard",
    description:
      "获取任务总览摘要。返回任务总数、未完成数、已完成数、逾期数，以及按所属分组组织的任务列表，适合回答“最近有哪些事项”“还有哪些没做完”这类总览问题。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    executor: async () => {
      return toJson(await getTodoDashboardData());
    },
  },
  {
    name: "get_todo_detail",
    description:
      "根据任务 ID 获取单个任务的完整详情。返回任务本身、所属分组、描述内容、周期规则、关联笔记和日历映射等信息，适合在进一步编辑或解释前先读取上下文。",
    parameters: {
      type: "object",
      properties: {
        todoId: { type: "number", description: "任务 ID" },
      },
      required: ["todoId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const todoId = args.todoId as number;
      return toJson(
        await executeTodoQuery({
          filter: { todoIds: [todoId] },
          groupBy: "none",
          sort: "manual",
          page: 1,
          pageSize: 10,
        }),
      );
    },
  },
];
