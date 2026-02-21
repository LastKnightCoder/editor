import { beforeEach, describe, expect, it, vi } from "vitest";
import * as tauri from "../../../services/tauri";
import { useTodoStore } from "../store/useTodoStore";

vi.mock("../../../services/tauri", () => ({
  todoListGroups: vi.fn(),
  todoGetSystemGroups: vi.fn(),
  todoGetGroupStats: vi.fn(),
  todoGetSystemGroupStats: vi.fn(),
  todoListItems: vi.fn(),
  todoListItemsByType: vi.fn(),
  todoCreateGroup: vi.fn(),
  todoUpdateGroup: vi.fn(),
  todoArchiveGroup: vi.fn(),
  todoReorderGroups: vi.fn(),
  todoCreateItem: vi.fn(),
  todoCreateItemRelative: vi.fn(),
  todoUpdateItem: vi.fn(),
  todoToggleCompleteCascade: vi.fn(),
  todoMoveAndReorder: vi.fn(),
  todoArchiveItem: vi.fn(),
  todoDeleteItem: vi.fn(),
  todoDeleteItemCascade: vi.fn(),
}));

function resetTodoStore() {
  useTodoStore.setState(
    {
      groups: [],
      systemGroups: [],
      groupStats: {},
      itemsByGroupId: {},
      activeGroupId: null,
      activeTodoId: null,
      filters: { type: "all" },
      loading: { groups: false, items: false },
      lastLoadedDatabase: null,
    },
    false,
  );
}

describe("todo/useTodoStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTodoStore();
  });

  it("initialize 应加载系统组和统计，并默认加载 all 组任务", async () => {
    vi.mocked(tauri.todoGetSystemGroups).mockResolvedValue([
      {
        id: 1,
        title: "全部任务",
        color: null,
        sortIndex: 1,
        isArchived: false,
        isSystem: true,
        systemType: "all",
        createTime: 1,
        updateTime: 1,
      },
    ]);
    vi.mocked(tauri.todoListGroups).mockResolvedValue([
      {
        id: 11,
        title: "工作",
        color: null,
        sortIndex: 1000,
        isArchived: false,
        isSystem: false,
        systemType: null,
        createTime: 1,
        updateTime: 1,
      },
    ]);
    vi.mocked(tauri.todoGetGroupStats).mockResolvedValue([
      { groupId: 11, total: 2, uncompleted: 1, overdue: 0 },
    ]);
    vi.mocked(tauri.todoGetSystemGroupStats).mockResolvedValue([
      { groupId: 1, total: 2, uncompleted: 1, overdue: 0 },
    ]);
    vi.mocked(tauri.todoListItemsByType).mockResolvedValue([
      {
        id: 101,
        groupId: 11,
        parentId: null,
        title: "任务 A",
        type: "normal",
        descriptionContentId: null,
        descriptionContent: null,
        isCompleted: false,
        startAt: null,
        dueAt: null,
        remindBefore: null,
        completedAt: null,
        sortIndex: 1,
        isArchived: false,
        createTime: 1,
        updateTime: 1,
        recurrence: null,
      },
    ]);

    await useTodoStore.getState().initialize("data.db");

    const state = useTodoStore.getState();
    expect(state.activeGroupId).toBe(1);
    expect(state.groupStats[1]?.total).toBe(2);
    expect(tauri.todoListItemsByType).toHaveBeenCalledWith({ type: "all" });
    expect(state.itemsByGroupId._system_all).toHaveLength(1);
  });

  it("setActiveGroup 切换到普通组时应加载该组任务", async () => {
    const baseState = useTodoStore.getState();
    useTodoStore.setState({
      ...baseState,
      groups: [
        {
          id: 11,
          title: "工作",
          color: null,
          sortIndex: 1000,
          isArchived: false,
          isSystem: false,
          systemType: null,
          createTime: 1,
          updateTime: 1,
        },
      ],
      systemGroups: [],
    });
    vi.mocked(tauri.todoListItems).mockResolvedValue([
      {
        id: 201,
        groupId: 11,
        parentId: null,
        title: "任务 B",
        type: "deadline",
        descriptionContentId: null,
        descriptionContent: null,
        isCompleted: false,
        startAt: null,
        dueAt: null,
        remindBefore: null,
        completedAt: null,
        sortIndex: 1,
        isArchived: false,
        createTime: 1,
        updateTime: 1,
        recurrence: null,
      },
    ]);

    await useTodoStore.getState().setActiveGroup(11);

    expect(tauri.todoListItems).toHaveBeenCalledWith({ groupId: 11 });
    expect(useTodoStore.getState().itemsByGroupId["11"]).toHaveLength(1);
  });
});
