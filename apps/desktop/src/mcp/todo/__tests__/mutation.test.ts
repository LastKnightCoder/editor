import { describe, expect, it } from "vitest";
import {
  doesTodoEventAffectGroup,
  doesTodoEventAffectTodo,
  shouldRefreshTodoQueryResult,
  TODO_MUTATION_ACTIONS,
} from "../mutation";
import type { TodoMutationEvent, TodoQueryResponse } from "@/types";

const buildEvent = (
  overrides: Partial<TodoMutationEvent> = {},
): TodoMutationEvent => ({
  source: "test",
  clientId: "client-1",
  entityType: "item",
  entityId: 1,
  groupId: 100,
  relatedItemId: 1,
  action: TODO_MUTATION_ACTIONS.UPDATE_ITEM,
  changedFields: ["title"],
  timestamp: Date.now(),
  ...overrides,
});

const baseQueryResult: TodoQueryResponse = {
  type: "todo-query-result",
  query: {
    filter: {},
    groupBy: "group",
    sort: "manual",
    page: 1,
    pageSize: 10,
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
  groups: [
    {
      key: "group:100",
      label: "工作",
      itemIds: [1],
      totalCount: 1,
    },
  ],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
  render: {
    layout: "todo-list",
    groupBy: "group",
    sort: "manual",
  },
};

describe("mcp/todo/mutation", () => {
  it("能判断事件是否影响当前任务", () => {
    expect(doesTodoEventAffectTodo(buildEvent(), 1)).toBe(true);
    expect(
      doesTodoEventAffectTodo(buildEvent({ entityId: 2, relatedItemId: 2 }), 1),
    ).toBe(false);
  });

  it("普通分组下仅同组事件命中", () => {
    expect(doesTodoEventAffectGroup(buildEvent({ groupId: 100 }), 100)).toBe(
      true,
    );
    expect(doesTodoEventAffectGroup(buildEvent({ groupId: 200 }), 100)).toBe(
      false,
    );
  });

  it("系统组下所有任务域事件都应触发刷新", () => {
    expect(
      doesTodoEventAffectGroup(
        buildEvent({ entityType: "note-link" }),
        1,
        "all",
      ),
    ).toBe(true);
    expect(
      doesTodoEventAffectGroup(
        buildEvent({ entityType: "calendar-mapping" }),
        1,
        "recurring",
      ),
    ).toBe(true);
  });

  it("group 改名命中当前结果中的 group 时应刷新", () => {
    const shouldRefresh = shouldRefreshTodoQueryResult({
      event: buildEvent({
        entityType: "group",
        entityId: 100,
        groupId: 100,
        action: TODO_MUTATION_ACTIONS.UPDATE_GROUP,
      }),
      query: { filter: {}, groupBy: "group", page: 1, pageSize: 10 },
      currentResult: baseQueryResult,
    });

    expect(shouldRefresh).toBe(true);
  });

  it("reorder-groups 应始终刷新 query 结果", () => {
    const shouldRefresh = shouldRefreshTodoQueryResult({
      event: buildEvent({
        entityType: "group",
        action: TODO_MUTATION_ACTIONS.REORDER_GROUPS,
        groupId: 999,
      }),
      query: { filter: {}, groupBy: "group", page: 1, pageSize: 10 },
      currentResult: baseQueryResult,
    });

    expect(shouldRefresh).toBe(true);
  });
});
