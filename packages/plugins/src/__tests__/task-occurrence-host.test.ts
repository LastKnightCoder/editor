import { expect, it, vi } from "vitest";
import { PluginHost, createMemoryStorage, type DataAdapter } from "../host";
import { definePlugin, type PluginContext } from "../index";
import { createPluginEnvironmentStore } from "../environment";

it("未接实例写入的宿主不能截断日期修改整系列", async () => {
  const writeTodo = vi.fn(async () => ({ priority: "high", tags: [] }));
  const data = { writeTodo } as unknown as DataAdapter;
  const host = new PluginHost({
    workspaceId: "fixture",
    environmentSource: createPluginEnvironmentStore({
      platform: "desktop",
      input: { finePointer: true, coarsePointer: false },
    }),
    storage: createMemoryStorage(),
    data,
    permissions: {
      query: async () => "granted",
      ensure: async () => undefined,
      request: async () => true,
    },
  });
  let context!: PluginContext;
  host.registerTrusted({
    ...definePlugin({
      id: "task.test",
      name: "待办测试",
      version: "1",
      create: () => ({
        activate(value) {
          context = value;
        },
      }),
    }),
    permissions: ["todos:write", "todos:delete"],
  });
  await host.enable("task.test");
  try {
    await expect(
      context.data.todos.delete("todo:1:10@2026-10-28", { expectedRevision: "version" })
    ).rejects.toThrow("未修改整系列");
    await expect(
      context.data.todos.setCompleted("todo:1:10@2026-10-28", true, { expectedRevision: "version" })
    ).rejects.toThrow("未修改整系列");
    expect(writeTodo).not.toHaveBeenCalled();
    const update = (id: string) =>
      context.data.todos.update(
        id,
        { priority: "high", tags: [] },
        { expectedRevision: "version" }
      );
    await expect(update("document:1:10:task")).rejects.toThrow("仅支持独立待办");
    await expect(update("todo:1:10@2026-10-28")).rejects.toThrow("仅支持独立待办");
    expect(writeTodo).not.toHaveBeenCalled();
    data.writeTodoOccurrence = vi.fn(async () => null);
    await context.data.todos.delete("todo:1:10@2026-10-28", { expectedRevision: "version" });
    expect(data.writeTodoOccurrence).toHaveBeenCalledWith(context, {
      action: "delete",
      id: "todo:1:10@2026-10-28",
      expectedRevision: "version",
    });
    expect(writeTodo).not.toHaveBeenCalled();
    await update("todo:1:10");
    expect(writeTodo).toHaveBeenCalledWith(context, {
      action: "update",
      id: "todo:1:10",
      patch: { priority: "high", tags: [] },
      expectedRevision: "version",
    });
  } finally {
    await host.dispose();
  }
});
