import { beforeEach, describe, expect, it, vi } from "vitest";
import { PluginConflictError, type PluginContext } from "@tau/plugins";

const electron = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/electron", () => ({ invoke: electron.invoke, on: vi.fn(), off: vi.fn() }));
vi.mock("@/commands/module-init", () => ({ withModule: (_: string, run: () => unknown) => run() }));

import useSettingStore from "@/stores/useSettingStore";
import { createDesktopData } from "../data";

const DATABASE = "data.db";
const context = { pluginId: "weekly", signal: new AbortController().signal } as PluginContext;
const task = {
  taskRef: { kind: "todo", todoId: 4, createdAt: 9 },
  revision: "r2",
  title: "交周报",
  completed: true,
  archived: false,
  dueAt: null,
  groupId: null,
  writable: true,
};

describe("插件写入适配", () => {
  beforeEach(() => {
    electron.invoke.mockReset();
    useSettingStore.setState(state => ({
      setting: { ...state.setting, database: { ...state.setting.database, active: DATABASE } },
    }));
  });

  it("待办：解析 ID，先预检再写入，记录发起插件", async () => {
    electron.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === "task-assistant:preflight") return args[1];
      if (channel === "task-assistant:write")
        return { requestId: "x", status: "succeeded", result: task };
      throw new Error(`未预期的调用 ${channel}`);
    });
    const todo = await createDesktopData(DATABASE).writeTodo(context, {
      action: "complete",
      id: "todo:4:9",
      completed: true,
      expectedRevision: "r1",
    });
    expect(todo).toMatchObject({ id: "todo:4:9", revision: "r2", completed: true });
    const [, name, input, , conversationKey] = electron.invoke.mock.calls[1];
    expect(name).toBe("set_todo_completed");
    expect(input).toMatchObject({
      taskRef: { kind: "todo", todoId: 4, createdAt: 9 },
      revision: "r1",
      completed: true,
    });
    expect(conversationKey).toBe("plugin:weekly");
  });

  it("助理返回版本冲突时抛出 PluginConflictError", async () => {
    electron.invoke.mockImplementation(async (channel: string, ...args: unknown[]) =>
      channel === "task-assistant:preflight"
        ? args[1]
        : {
            requestId: "x",
            status: "failed",
            error: { code: "VERSION_CONFLICT", message: "已变化" },
          }
    );
    await expect(
      createDesktopData(DATABASE).writeTodo(context, {
        action: "update",
        id: "todo:4:9",
        patch: { title: "新" },
        expectedRevision: "r0",
      })
    ).rejects.toBeInstanceOf(PluginConflictError);
  });

  it("主进程的冲突前缀转为 PluginConflictError", async () => {
    electron.invoke.mockRejectedValue(
      new Error("Error invoking remote method: Error: PLUGIN_CONFLICT:数据已被修改")
    );
    await expect(
      createDesktopData(DATABASE).update(context, "card", "3", { pinned: true }, "1")
    ).rejects.toMatchObject({ name: "PluginConflictError", message: "数据已被修改" });
  });

  it("删除待办后登记撤销凭据，恢复走助理撤销", async () => {
    electron.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === "task-assistant:read") return { items: [task], nextCursor: null };
      if (channel === "task-assistant:preflight") return args[1];
      if (channel === "task-assistant:write")
        return { requestId: "x", status: "succeeded", operationId: "op-1" };
      return undefined;
    });
    const data = createDesktopData(DATABASE);
    await data.writeTodo(context, { action: "delete", id: "todo:4:9", expectedRevision: "r2" });
    expect(electron.invoke).toHaveBeenCalledWith("plugin-data:record-operation", {
      databaseName: DATABASE,
      pluginId: "weekly",
      entity: "todo",
      entityId: "todo:4:9",
      title: "交周报",
      operationId: "op-1",
    });
    electron.invoke.mockClear();
    await data.restore({
      id: 5,
      action: "delete",
      entity: "todo",
      entityId: "todo:4:9",
      title: "交周报",
      createdAt: 1,
      restoredAt: null,
      operationId: "op-1",
    });
    const names = electron.invoke.mock.calls.map(([channel, name]) =>
      channel === "task-assistant:write" ? `${channel}:${name}` : channel
    );
    expect(names).toEqual([
      "task-assistant:preflight",
      "task-assistant:write:undo_task_operation",
      "plugin-data:mark-restored",
    ]);
  });
});
