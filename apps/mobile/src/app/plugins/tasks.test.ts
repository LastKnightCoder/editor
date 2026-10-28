import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { PluginPermissionBroker } from "@tau/plugins/permission-host";
import { createMobileData } from "./data";
import { request as sharedRequest } from "../../features/collaboration/core/rest";
import { prepareContentWrite } from "../../services/contentWriteCoordinator";
import {
  writePluginSharedContent,
  readPluginSharedContent,
} from "../../services/pluginContentSession";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../services/contentWriteCoordinator", () => ({
  prepareContentWrite: vi.fn(async () => () => undefined),
}));
vi.mock("../../services/pluginContentSession", () => ({
  readPluginSharedContent: vi.fn(),
  writePluginSharedContent: vi.fn(),
}));
vi.mock("../../features/collaboration/core/manager", () => ({
  collaborationManager: {
    openDocument: vi.fn(),
    session: () => ({ info: { serverUrl: "https://example.com" } }),
    project: vi.fn(),
  },
}));
vi.mock("../../features/collaboration/core/rest", () => ({ request: vi.fn() }));
vi.mock("../../services/editorKit", () => ({ getMobileContentKit: () => ({ extensions: [] }) }));
vi.mock("./content", async original => {
  const actual = await original<typeof import("./content")>();
  const prepare = async () => ({
    resolve: () => ({ access: "edit" }),
    createDocument: async () => ({
      content: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
      contracts: {},
    }),
  });
  return {
    ...actual,
    mobileContentPlugins: new Proxy(actual.mobileContentPlugins, {
      get(target, key) {
        if (key === "prepareEditorContracts") return prepare;
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  };
});
const nodes = [
  {
    type: "check-list",
    children: [
      {
        type: "check-list-item",
        taskId: "one",
        children: [{ type: "paragraph", children: [{ type: "formatted", text: "任务" }] }],
      },
    ],
  },
];
const body = {
  task: { id: "document:1:1:one", revision: "task-version", title: "任务" },
  document: {
    contentId: 1,
    createTime: 1,
    documentId: "body",
    librarySourceId: "library",
    revision: "body-version",
    content: nodes,
    contracts: {},
    count: 2,
  },
  binding: null as string | null,
};
const context = (controller = new AbortController()) =>
  ({ pluginId: "test.tasks", signal: controller.signal }) as PluginContext;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockReset();
});
it("待办实例查询先授权且保留 view、日期与原始实例 ID", async () => {
  const broker = new PluginPermissionBroker({ read: async () => ({}), write: vi.fn() }, () => true);
  const data = createMobileData("one.db", "session-one", vi.fn());
  const host = new PluginHost({
    workspaceId: "one.db",
    storage: createMemoryStorage(),
    data,
    permissions: broker,
  });
  let ctx!: PluginContext;
  host.registerTrusted({
    ...definePlugin({
      id: "test.tasks",
      name: "任务",
      version: "1",
      create: () => ({
        activate(value) {
          ctx = value;
        },
      }),
    }),
    permissions: ["todos:read"],
  });
  await host.enable("test.tasks");
  vi.mocked(invoke).mockResolvedValue({
    items: [{ id: "todo:1:1@2026-10-01", revision: "instance" }],
  });
  try {
    await expect(ctx.data.todos.query({ view: "occurrences" })).rejects.toThrow("start/end");
    const pending = ctx.data.todos.query({
      source: "all",
      view: "occurrences",
      start: "2026-10-01",
      end: "2026-10-03",
      limit: 1,
    });
    await vi.waitFor(() => expect(broker.prompts).toHaveLength(1));
    expect(invoke).not.toHaveBeenCalled();
    await broker.prompts[0].decide("once");
    expect((await pending).items[0].id).toBe("todo:1:1@2026-10-01");
    expect(invoke).toHaveBeenCalledWith(
      "plugin_tasks_read",
      expect.objectContaining({
        database: "one.db",
        token: "session-one",
        pluginId: "test.tasks",
        timeZone: expect.any(String),
        request: {
          method: "todos",
          query: {
            source: "all",
            view: "occurrences",
            start: "2026-10-01",
            end: "2026-10-03",
            limit: 1,
          },
        },
      })
    );
    await expect(
      ctx.data.calendar.query({ start: "2026-10-01", end: "2026-10-03" })
    ).rejects.toMatchObject({ reason: "undeclared" });
  } finally {
    await host.dispose();
    broker.dispose();
    data.dispose();
  }
});
it("正文待办经保存协调和 todos:write 复验，不改成独立待办", async () => {
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    const req = (args as { request: { method: string; write: unknown } }).request;
    if (command === "plugin_tasks_read" && req.method === "prepare")
      return { before: body, nodes, contracts: {}, task: body.task };
    if (command === "plugin_tasks_read") return body;
    return {
      document: { ...body.document, revision: "saved" },
      task: { ...body.task, revision: "changed" },
    };
  });
  const check = vi.fn(async () => undefined);
  const data = createMobileData("one.db", "scope", vi.fn(), check);
  const ctx = context();
  try {
    expect(
      await data.writeTodo(ctx, {
        action: "complete",
        id: body.task.id,
        expectedRevision: body.task.revision,
        completed: true,
      })
    ).toMatchObject({ revision: "changed" });
    expect(prepareContentWrite).toHaveBeenCalledWith("library", "body");
    expect(check).toHaveBeenCalledWith(ctx, "todos:write");
    expect(invoke).toHaveBeenLastCalledWith(
      "plugin_tasks_write",
      expect.objectContaining({
        request: expect.objectContaining({
          write: expect.objectContaining({
            id: body.task.id,
            expectedRevision: "task-version",
            documentRevision: "body-version",
          }),
        }),
      })
    );
    expect(
      vi
        .mocked(invoke)
        .mock.calls.every(([cmd]) => cmd === "plugin_tasks_read" || cmd === "plugin_tasks_write")
    ).toBe(true);
  } finally {
    data.dispose();
  }
});
it("切库/停用时的迟到任务查询不交付，结束会话后拒绝日程写入", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  const controller = new AbortController();
  const data = createMobileData("one.db", "scope", vi.fn());
  const pending = data.todos(context(controller), { limit: 10 });
  controller.abort();
  resolve({ items: [] });
  await expect(pending).rejects.toThrow();
  data.dispose();
  await expect(
    data.writeCalendar(context(), { action: "delete", id: "1:1", expectedRevision: "rev" })
  ).rejects.toThrow("会话已结束");
  expect(invoke).toHaveBeenCalledTimes(1);
});
it("共享正文删除在发送条件提交前先落恢复意图", async () => {
  const shared = { ...body, binding: "shared" };
  const remote = { nodes, contracts: {}, revision: "remote-version" };
  vi.mocked(readPluginSharedContent).mockResolvedValue(
    remote as Awaited<ReturnType<typeof readPluginSharedContent>>
  );
  let staged = false;
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const req = (args as { request: { method: string; write: unknown } }).request;
    if (req.method === "prepare") return { before: shared, nodes: [], contracts: {}, task: null };
    if (req.method === "document-stage") {
      staged = true;
      return { id: 7 };
    }
    return shared;
  });
  vi.mocked(writePluginSharedContent).mockImplementation(
    async (_id, value, _contracts, _revision, _guard, origin, prepared) => {
      expect(staged).toBe(false);
      await prepared?.({
        operationId: "remote-op",
        nodes: value,
        revision: "candidate",
        request: {
          operationId: "remote-op",
          epoch: 0,
          baselineId: "base",
          version: 2,
          updateHash: "hash",
          expiresAt: 1,
        },
      });
      expect(staged).toBe(true);
      expect(origin?.taskOperationId).toBe(7);
      return "candidate";
    }
  );
  const data = createMobileData("one.db", "scope", vi.fn(), async () => undefined);
  try {
    expect(
      await data.writeTodo(context(), {
        action: "delete",
        id: body.task.id,
        expectedRevision: body.task.revision,
      })
    ).toBeNull();
  } finally {
    data.dispose();
  }
});

it("恢复回执已中止时不得报告恢复成功", async () => {
  const stored = {
    id: 7,
    pending: true,
    restoring: true,
    payload: {
      operationId: "ledger",
      documentTask: {
        binding: "shared",
        before: body.document,
        restoreRemote: { operationId: "restore", request: {} },
      },
    },
  };
  vi.mocked(invoke).mockImplementation(async (_command, args) =>
    (args as { request: { method: string } }).request.method === "operation" ? stored : null
  );
  vi.mocked(sharedRequest).mockResolvedValue({ operation: { state: "ABORTED" } });
  const data = createMobileData("one.db", "scope", vi.fn());
  try {
    await expect(data.restore("test.tasks", 7)).rejects.toThrow("共享恢复未提交");
    expect(invoke).toHaveBeenCalledWith(
      "plugin_tasks_write",
      expect.objectContaining({ request: { method: "cancel-shared", id: 7 } })
    );
  } finally {
    data.dispose();
  }
});
