import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTodoStore } from "@/stores/useTodoStore";
import * as todoCommands from "@/commands/todo";

vi.mock("@/commands/todo", () => ({
  listTodoGroups: vi.fn(),
  createTodoGroup: vi.fn(),
  updateTodoGroup: vi.fn(),
  archiveTodoGroup: vi.fn(),
  reorderTodoGroups: vi.fn(),
  getTodoGroupStats: vi.fn(),
  getSystemGroupStats: vi.fn(),
  getSystemGroups: vi.fn(),
  listTodoItems: vi.fn(),
  listTodoItemsByType: vi.fn(),
  createTodoItem: vi.fn(),
  createTodoItemRelative: vi.fn(),
  updateTodoItem: vi.fn(),
  toggleCompleteCascade: vi.fn(),
  moveAndReorderTodoItem: vi.fn(),
  archiveTodoItem: vi.fn(),
  deleteTodoItem: vi.fn(),
  deleteTodoItemCascade: vi.fn(),
  listTodoNotes: vi.fn(),
  attachExistingNote: vi.fn(),
  createAndAttachNote: vi.fn(),
  detachNote: vi.fn(),
  reorderNotes: vi.fn(),
  updateNoteTitleSnapshot: vi.fn(),
}));

describe("stores/useTodoStore 当前分组刷新", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    useTodoStore.setState(
      {
        ui: {
          leftOpen: true,
          rightOpen: false,
          leftWidth: 260,
          rightWidth: 360,
        },
        groups: [],
        systemGroups: [],
        groupStats: {},
        itemsByGroupId: {},
        notesByTodoId: {},
        activeGroupId: null,
        activeTodoId: null,
        expandedIds: new Set<number>(),
        filters: {},
        loading: { groups: false, items: false, notes: false },
      },
      false,
    );
  });

  it("系统分组下 deleteItemCascade 应刷新 listTodoItemsByType", async () => {
    vi.mocked(todoCommands.deleteTodoItemCascade).mockResolvedValue(1);
    vi.mocked(todoCommands.listTodoItemsByType).mockResolvedValue([]);
    vi.mocked(todoCommands.listTodoItems).mockResolvedValue([]);
    vi.mocked(todoCommands.getTodoGroupStats).mockResolvedValue([]);
    vi.mocked(todoCommands.getSystemGroupStats).mockResolvedValue([]);

    useTodoStore.setState(
      {
        activeGroupId: 2,
        systemGroups: [
          {
            id: 2,
            title: "普通任务",
            sortIndex: 1024,
            isArchived: false,
            isSystem: true,
            systemType: "normal",
            createTime: 1,
            updateTime: 1,
          },
        ],
      },
      false,
    );

    await useTodoStore.getState().deleteItemCascade(99);

    expect(todoCommands.deleteTodoItemCascade).toHaveBeenCalledWith(99);
    expect(todoCommands.listTodoItemsByType).toHaveBeenCalledWith("normal");
    expect(todoCommands.listTodoItems).not.toHaveBeenCalled();
  });

  it("普通分组下 deleteItemCascade 应刷新 listTodoItems", async () => {
    vi.mocked(todoCommands.deleteTodoItemCascade).mockResolvedValue(1);
    vi.mocked(todoCommands.listTodoItemsByType).mockResolvedValue([]);
    vi.mocked(todoCommands.listTodoItems).mockResolvedValue([]);
    vi.mocked(todoCommands.getTodoGroupStats).mockResolvedValue([]);
    vi.mocked(todoCommands.getSystemGroupStats).mockResolvedValue([]);

    useTodoStore.setState(
      {
        activeGroupId: 11,
        systemGroups: [],
      },
      false,
    );

    await useTodoStore.getState().deleteItemCascade(99);

    expect(todoCommands.deleteTodoItemCascade).toHaveBeenCalledWith(99);
    expect(todoCommands.listTodoItems).toHaveBeenCalledWith(11);
    expect(todoCommands.listTodoItemsByType).not.toHaveBeenCalled();
  });
});
