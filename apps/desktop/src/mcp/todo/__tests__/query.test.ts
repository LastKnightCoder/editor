import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeTodoQuery, getTodoDashboardData } from "../query";
import type { TodoGroup, TodoItem } from "@/types";

vi.mock("@/commands/todo", () => ({
  listTodoGroups: vi.fn(),
  getSystemGroups: vi.fn(),
  listTodoItems: vi.fn(),
  listTodoItemsByType: vi.fn(),
  listTodoNotes: vi.fn(),
  listTodoNotesByTodoIds: vi.fn(),
  getRecurrenceByItemId: vi.fn(),
  getRecurrencesByItemIds: vi.fn(),
  getRecurrenceCompletions: vi.fn(),
  getRecurrenceCompletionsByRecurrenceIds: vi.fn(),
  getCalendarMappingsByTodo: vi.fn(),
  getCalendarMappingsByTodoIds: vi.fn(),
}));

vi.mock("@/utils/markdown", () => ({
  getMarkdown: vi.fn(() => "markdown"),
}));

import * as todoCommands from "@/commands/todo";

const systemGroups: TodoGroup[] = [
  {
    id: 1,
    title: "全部任务",
    color: undefined,
    sortIndex: 0,
    isArchived: false,
    isSystem: true,
    systemType: "all",
    createTime: 1,
    updateTime: 1,
  },
];

const groups: TodoGroup[] = [
  {
    id: 101,
    title: "工作",
    color: "#1677ff",
    sortIndex: 10,
    isArchived: false,
    isSystem: false,
    systemType: null,
    createTime: 1,
    updateTime: 1,
  },
  {
    id: 102,
    title: "生活",
    color: "#52c41a",
    sortIndex: 20,
    isArchived: false,
    isSystem: false,
    systemType: null,
    createTime: 1,
    updateTime: 1,
  },
];

const items: TodoItem[] = [
  {
    id: 1,
    groupId: 101,
    parentId: null,
    title: "写周报",
    type: "deadline",
    isCompleted: false,
    dueAt: Date.now() - 1000,
    startAt: null,
    remindBefore: null,
    completedAt: null,
    sortIndex: 10,
    isArchived: false,
    createTime: 100,
    updateTime: 200,
  },
  {
    id: 2,
    groupId: 101,
    parentId: null,
    title: "整理任务",
    type: "normal",
    isCompleted: true,
    dueAt: null,
    startAt: null,
    remindBefore: null,
    completedAt: 500,
    sortIndex: 20,
    isArchived: false,
    createTime: 110,
    updateTime: 300,
  },
  {
    id: 3,
    groupId: 102,
    parentId: null,
    title: "买菜",
    type: "planned",
    isCompleted: false,
    dueAt: Date.now() + 86400000,
    startAt: Date.now(),
    remindBefore: null,
    completedAt: null,
    sortIndex: 30,
    isArchived: false,
    createTime: 120,
    updateTime: 400,
  },
];

describe("mcp/todo/query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(todoCommands.getSystemGroups).mockResolvedValue(systemGroups);
    vi.mocked(todoCommands.listTodoGroups).mockResolvedValue(groups);
    vi.mocked(todoCommands.listTodoItemsByType).mockImplementation(async type => {
      if (type === "all") {
        return items;
      }
      return items.filter(item => item.type === type);
    });
    vi.mocked(todoCommands.listTodoItems).mockImplementation(async groupId =>
      items.filter(item => item.groupId === groupId)
    );
    vi.mocked(todoCommands.listTodoNotes).mockResolvedValue([]);
    vi.mocked(todoCommands.listTodoNotesByTodoIds).mockResolvedValue({});
    vi.mocked(todoCommands.getRecurrenceByItemId).mockResolvedValue(null);
    vi.mocked(todoCommands.getRecurrencesByItemIds).mockResolvedValue({});
    vi.mocked(todoCommands.getRecurrenceCompletions).mockResolvedValue([]);
    vi.mocked(todoCommands.getRecurrenceCompletionsByRecurrenceIds).mockResolvedValue({});
    vi.mocked(todoCommands.getCalendarMappingsByTodo).mockResolvedValue([]);
    vi.mocked(todoCommands.getCalendarMappingsByTodoIds).mockResolvedValue({});
  });

  it("支持按关键字和完成状态组合查询", async () => {
    const result = await executeTodoQuery({
      filter: {
        keyword: "任务",
        isCompleted: true,
      },
      groupBy: "group",
      sort: "manual",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe(2);
    expect(result.summary.completedCount).toBe(1);
    expect(result.summary.pendingCount).toBe(0);
  });

  it("支持按状态分桶并计算逾期统计", async () => {
    const result = await executeTodoQuery({
      filter: {
        isArchived: false,
      },
      groupBy: "status",
      sort: "manual",
    });

    const bucketLabels = result.groups.map(group => group.label);
    expect(bucketLabels).toContain("已完成");
    expect(bucketLabels).toContain("已逾期");
    expect(result.summary.overdueCount).toBe(1);
    expect(result.summary.totalCount).toBe(3);
  });

  it("支持按组名精确筛选", async () => {
    const result = await executeTodoQuery({
      filter: {
        groupNames: ["工作"],
      },
      groupBy: "group",
      sort: "manual",
    });

    expect(result.total).toBe(2);
    expect(new Set(result.items.map(item => item.groupId))).toEqual(new Set([101]));
  });

  it("支持使用日期字符串做时间筛选", async () => {
    const result = await executeTodoQuery({
      filter: {
        timeField: "createTime",
        start: "1970-01-01",
        end: "1970-01-01",
      },
      groupBy: "group",
      sort: "manual",
    });

    expect(result.total).toBe(3);
  });

  it("返回任务总览摘要", async () => {
    const dashboard = await getTodoDashboardData();

    expect(dashboard.type).toBe("todo-dashboard");
    expect(dashboard.summary.totalCount).toBe(3);
    expect(dashboard.pendingItems.length).toBeGreaterThan(0);
    expect(dashboard.recentCompletedItems[0]?.id).toBe(2);
    expect(dashboard.groups.some(group => group.title === "工作")).toBe(true);
  });
});
