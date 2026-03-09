import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/todo", () => ({
  toggleCompleteCascade: vi.fn(),
  completeRecurrence: vi.fn(),
  createCalendarMapping: vi.fn(),
  getRecurrence: vi.fn(),
  getTodoNoteLinkById: vi.fn(),
  detachNote: vi.fn(),
  updateNoteTitleSnapshot: vi.fn(),
}));

vi.mock("@/mcp/todo/query", () => ({
  executeTodoQuery: vi.fn(),
}));

vi.mock("@/mcp/todo/mutation", () => ({
  TODO_MUTATION_ACTIONS: {
    COMPLETE_ITEM: "complete-item",
    UNCOMPLETE_ITEM: "uncomplete-item",
    COMPLETE_OCCURRENCE: "complete-occurrence",
    CREATE_CALENDAR_MAPPING: "create-calendar-mapping",
    DETACH_NOTE: "detach-note",
    UPDATE_NOTE_TITLE_SNAPSHOT: "update-note-title-snapshot",
    CREATE_ITEM_ABOVE: "create-item-above",
    CREATE_ITEM_BELOW: "create-item-below",
    CREATE_ITEM_CHILD: "create-item-child",
  },
  emitTodoMutation: vi.fn((payload) => ({ ...payload, timestamp: 123 })),
}));

import * as todoCommands from "@/commands/todo";
import { executeTodoQuery } from "@/mcp/todo/query";
import { buildTodoItemTools } from "../item-tools";
import { buildTodoRecurrenceTools } from "../recurrence-tools";
import { buildTodoCalendarTools } from "../calendar-tools";
import { buildTodoNoteTools } from "../note-tools";

const findTool = <T extends { name: string }>(tools: T[], name: string) => {
  const tool = tools.find((entry) => entry.name === name);
  expect(tool).toBeTruthy();
  return tool!;
};

describe("todo provider 事件上下文", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(executeTodoQuery).mockResolvedValue({
      type: "todo-query-result",
      query: {
        filter: { todoIds: [1] },
        groupBy: "none",
        page: 1,
        pageSize: 1,
      },
      summary: {
        totalCount: 1,
        completedCount: 0,
        pendingCount: 1,
        overdueCount: 0,
        groupsCount: 1,
        recentCompleted: [],
      },
      items: [
        {
          id: 1,
          groupId: 100,
          parentId: null,
          title: "任务 A",
          type: "normal",
          isCompleted: false,
          startAt: null,
          dueAt: null,
          remindBefore: null,
          completedAt: null,
          sortIndex: 1,
          isArchived: false,
          createTime: 1,
          updateTime: 1,
        },
      ],
      groups: [],
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
      render: { layout: "todo-list", groupBy: "none", sort: "manual" },
    } as any);
  });

  it("toggle_todo_complete 会主动补 groupId", async () => {
    const tool = findTool(buildTodoItemTools(), "toggle_todo_complete");
    const result = await tool.executor({ id: 1, isCompleted: true });
    const parsed = JSON.parse((result as { content: string }).content);

    expect(todoCommands.toggleCompleteCascade).toHaveBeenCalledWith(1, true);
    expect(parsed.event.groupId).toBe(100);
    expect(parsed.event.entityId).toBe(1);
  });

  it("complete_todo_occurrence 会通过 recurrenceId 解析 todo 上下文", async () => {
    vi.mocked(todoCommands.getRecurrence).mockResolvedValue({
      id: 501,
      todoItemId: 1,
      type: "daily",
      interval: 1,
      weekdays: null,
      monthDay: null,
      yearMonth: null,
      yearDay: null,
      excludeHolidays: false,
      startDate: 1,
      endDate: null,
      maxOccurrences: null,
      createTime: 1,
      updateTime: 1,
    } as any);
    vi.mocked(todoCommands.completeRecurrence).mockResolvedValue({
      id: 1,
      recurrenceId: 501,
      scheduledDate: 10,
      completedAt: 11,
      skipped: false,
      createTime: 11,
    } as any);

    const tool = findTool(
      buildTodoRecurrenceTools(),
      "complete_todo_occurrence",
    );
    const result = await tool.executor({
      recurrenceId: 501,
      scheduledDate: 10,
    });
    const parsed = JSON.parse((result as { content: string }).content);

    expect(todoCommands.getRecurrence).toHaveBeenCalledWith(501);
    expect(parsed.event.groupId).toBe(100);
    expect(parsed.event.relatedItemId).toBe(1);
  });

  it("create_todo_calendar_mapping 会补 groupId", async () => {
    vi.mocked(todoCommands.createCalendarMapping).mockResolvedValue({
      id: 801,
      todoItemId: 1,
      calendarEventId: 901,
      syncType: "deadline",
      recurrenceDate: null,
      createTime: 1,
    } as any);

    const tool = findTool(
      buildTodoCalendarTools(),
      "create_todo_calendar_mapping",
    );
    const result = await tool.executor({
      todoItemId: 1,
      calendarEventId: 901,
      syncType: "deadline",
    });
    const parsed = JSON.parse((result as { content: string }).content);

    expect(parsed.event.groupId).toBe(100);
    expect(parsed.event.relatedItemId).toBe(1);
  });

  it("detach_todo_note 在未传 todoId 时也能补 groupId", async () => {
    vi.mocked(todoCommands.getTodoNoteLinkById).mockResolvedValue({
      id: 11,
      todoId: 1,
      contentId: 301,
      title: "笔记",
      type: "card",
      sortIndex: 1,
      createTime: 1,
      updateTime: 1,
    } as any);

    const tool = findTool(buildTodoNoteTools(), "detach_todo_note");
    const result = await tool.executor({ linkId: 11 });
    const parsed = JSON.parse((result as { content: string }).content);

    expect(parsed.event.groupId).toBe(100);
    expect(parsed.event.relatedItemId).toBe(1);
  });
});
