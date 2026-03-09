import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TodoToolRenderer from "../TodoToolRenderer";
import type {
  ToolCallExecutionState,
  TodoGroup,
  TodoQueryResponse,
} from "@/types";

vi.mock("@/commands/todo", () => ({
  listTodoGroups: vi.fn(),
  toggleCompleteCascade: vi.fn(),
}));

vi.mock("@/mcp/todo/query", () => ({
  executeTodoQuery: vi.fn(),
  getTodoDashboardData: vi.fn(),
  isTodoQueryResponse: (value: unknown) =>
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === "todo-query-result",
  isTodoDashboardResponse: (value: unknown) =>
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === "todo-dashboard",
}));

vi.mock("@/mcp/todo/events", () => ({
  subscribeTodoMutationEvent: vi.fn(() => () => undefined),
}));

vi.mock("@/mcp/todo/mutation", () => ({
  TODO_MUTATION_ACTIONS: {
    COMPLETE_ITEM: "complete-item",
    UNCOMPLETE_ITEM: "uncomplete-item",
  },
  emitTodoMutation: vi.fn((payload) => ({ ...payload, timestamp: 123 })),
  shouldRefreshTodoQueryResult: vi.fn(() => false),
}));

import * as todoCommands from "@/commands/todo";
import * as todoMutation from "@/mcp/todo/mutation";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const groups: TodoGroup[] = [
  {
    id: 100,
    title: "工作",
    color: "#1677ff",
    sortIndex: 10,
    isArchived: false,
    isSystem: false,
    systemType: null,
    createTime: 1,
    updateTime: 1,
  },
];

const queryResult: TodoQueryResponse = {
  type: "todo-query-result",
  query: {
    filter: { todoIds: [1] },
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
      descriptionContentId: null,
      descriptionMarkdown: "测试描述",
      isCompleted: false,
      startAt: null,
      dueAt: null,
      remindBefore: null,
      completedAt: null,
      sortIndex: 10,
      isArchived: false,
      createTime: 100,
      updateTime: 200,
      group: groups[0],
      noteCount: 1,
      notes: [],
      recurrence: null,
      recurrenceCompletions: [],
      calendarMappings: [],
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

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {},
): ToolCallExecutionState => ({
  toolCallId: "todo-tool-call-1",
  toolName: "query_todos",
  status: "success",
  input: JSON.stringify(queryResult.query),
  output: JSON.stringify(queryResult),
  timestamp: Date.now(),
  ...overrides,
});

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("TodoToolRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(todoCommands.listTodoGroups).mockResolvedValue(groups);
  });

  it("只保留完成切换的轻交互", async () => {
    const execution = createExecution();
    const { root, container } = await mount(
      <TodoToolRenderer
        execution={execution}
        isDark={false}
        parsedInput={queryResult.query}
        renderDefault={() => <div>fallback</div>}
      />,
    );

    expect(container.textContent).toContain("任务 A");
    expect(container.textContent).not.toContain("编辑规则");
    expect(container.textContent).not.toContain("管理笔记");
    expect(container.textContent).not.toContain("管理映射");
    expect(container.textContent).not.toContain("改标题");
    expect(container.textContent).not.toContain("归档");
    expect(container.textContent).not.toContain("删除");

    const toggleButton = container.querySelector(
      "button[aria-label='标记为已完成']",
    ) as HTMLButtonElement | null;
    expect(toggleButton).toBeTruthy();
    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(todoCommands.toggleCompleteCascade).toHaveBeenCalledWith(1, true);
    expect(todoMutation.emitTodoMutation).toHaveBeenCalled();

    await unmount(root, container);
  });
});
