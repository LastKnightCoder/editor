// 订阅化后的 useTodoStore 测试：UI 态、初始化编排、mutation 失效、乐观更新。
// 服务端数据读取路径的测试由组件/hooks 层与 query 缓存行为承载。

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as tauri from "../../../services/tauri";
import { getQueryClient } from "../../../router";
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
      activeGroupId: null,
      filters: { type: "all" },
      initializing: false,
    },
    false
  );
}

describe("todo/useTodoStore（订阅化后）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTodoStore();
    getQueryClient().clear();
  });

  it("initialize 预取分组数据并设置 fallback 激活分组", async () => {
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
    vi.mocked(tauri.todoListGroups).mockResolvedValue([]);
    vi.mocked(tauri.todoGetGroupStats).mockResolvedValue([]);
    vi.mocked(tauri.todoGetSystemGroupStats).mockResolvedValue([]);

    await useTodoStore.getState().initialize("data.db");
    expect(useTodoStore.getState().activeGroupId).toBe(1);
  });

  it("mutation 后失效 todo 查询缓存", async () => {
    const invalidateSpy = vi.spyOn(getQueryClient(), "invalidateQueries");
    vi.mocked(tauri.todoDeleteItem).mockResolvedValue(1);

    await useTodoStore.getState().deleteItem(9);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["todo"] });
  });

  it("patchItemDescriptionContent 乐观更新 items 订阅缓存", () => {
    const setSpy = vi.spyOn(getQueryClient(), "setQueriesData");
    useTodoStore.getState().patchItemDescriptionContent(5, 3, []);
    expect(setSpy).toHaveBeenCalledWith({ queryKey: ["todo", "items"] }, expect.any(Function));
  });

  it("setActiveGroup 生效，filters 支持部分更新", () => {
    useTodoStore.getState().setActiveGroup(2);
    expect(useTodoStore.getState().activeGroupId).toBe(2);

    useTodoStore.getState().setFilters({ completed: false });
    expect(useTodoStore.getState().filters).toEqual({
      type: "all",
      completed: false,
    });
  });
});
