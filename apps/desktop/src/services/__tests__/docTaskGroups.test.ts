import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  database: "a",
  settingListener: undefined as ((next: any, previous: any) => void) | undefined,
  list: vi.fn(async () => [] as any[]),
  metadata: vi.fn(async () => [] as any[]),
  create: vi.fn(async () => ({ id: 1, title: "新项目", createTime: 1 })),
  emit: vi.fn(),
}));
vi.mock("@/commands/todo", () => ({ listTodoGroups: state.list, createTodoGroup: state.create }));
vi.mock("@/commands/doc-tasks", () => ({ getDocTaskGroups: state.metadata }));
vi.mock("@/mcp/todo/mutation", () => ({
  emitTodoMutation: state.emit,
  TODO_MUTATION_ACTIONS: { CREATE_GROUP: "create-group" },
}));
vi.mock("@/mcp/todo/events", () => ({ subscribeTodoMutationEvent: () => () => {} }));
vi.mock("@/stores/useSettingStore", () => ({
  default: {
    getState: () => ({ setting: { database: { active: state.database } } }),
    subscribe: (listener: typeof state.settingListener) => {
      state.settingListener = listener;
    },
  },
}));
vi.mock("@/stores/useGlobalStateStore", () => ({ default: { subscribe: () => {} } }));
const switchDatabase = (database: string) => {
  const previous = state.database;
  state.database = database;
  state.settingListener?.(
    { setting: { database: { active: database } } },
    { setting: { database: { active: previous } } }
  );
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.database = "a";
  state.settingListener = undefined;
  state.metadata.mockResolvedValue([]);
});
describe("编辑器项目缓存的库隔离", () => {
  it("新建项目迟到响应不追加到新库", async () => {
    state.list.mockImplementation(async () => [
      { id: state.database === "a" ? 1 : 2, title: state.database, createTime: 1 },
    ]);
    let finish: ((group: any) => void) | undefined;
    state.create.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const service = (await import("../docTaskGroups")).desktopDocTaskGroups;
    service.list();
    await vi.waitFor(() => expect(service.list()[0]?.title).toBe("a"));
    const pending = service.create("旧库新项目");
    switchDatabase("b");
    finish?.({ id: 3, title: "旧库新项目", createTime: 1 });
    await expect(pending).rejects.toThrow("项目数据已变化");
    await vi.waitFor(() => expect(service.list()[0]?.title).toBe("b"));
    expect(service.list().some(group => group.title === "旧库新项目")).toBe(false);
    expect(state.emit).not.toHaveBeenCalled();
  });
  it("A 到 B 再回 A，第一轮 A 的结果不会覆盖第三轮", async () => {
    const requests: Array<(groups: any[]) => void> = [];
    state.list.mockImplementation(
      () =>
        new Promise(resolve => {
          requests.push(resolve);
        })
    );
    const service = (await import("../docTaskGroups")).desktopDocTaskGroups;
    service.list();
    switchDatabase("b");
    switchDatabase("a");
    requests[2]([{ id: 1, title: "新 A", createTime: 1 }]);
    await vi.waitFor(() => expect(service.list()[0]?.title).toBe("新 A"));
    requests[0]([{ id: 1, title: "旧 A", createTime: 1 }]);
    requests[1]([{ id: 2, title: "B", createTime: 1 }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(service.list()[0]?.title).toBe("新 A");
  });
});
