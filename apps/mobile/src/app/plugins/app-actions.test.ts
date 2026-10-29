import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { createMobileApp } from "./app";
import type { MobileDataAdapter } from "./data";
import { createMobileAppActions, type MobileActionDraft } from "./app-actions";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const draft: MobileActionDraft = {
  nodes: [{ type: "paragraph", children: [{ type: "formatted", text: "预填" }] }],
  contracts: {},
  count: 2,
};
const input = { content: draft, tags: ["标签"], title: "文档", projectId: "1", parentId: "2" };
const owner = { id: "test.actions", name: "测试插件" };
const active: ReturnType<typeof createMobileAppActions>[] = [];
function setup() {
  const lifetime = new AbortController();
  const context = {
    pluginId: owner.id,
    workspaceId: "one.db",
    signal: lifetime.signal,
  } as PluginContext;
  const prepareContent = vi.fn(async () => structuredClone(draft));
  const ready = vi.fn(async () => undefined);
  const changed = vi.fn();
  const actions = createMobileAppActions(
    "one.db",
    "one-token",
    { prepareContent } as unknown as MobileDataAdapter,
    ready,
    changed
  );
  active.push(actions);
  return { actions, context, lifetime, prepareContent, ready, changed };
}
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });
});
afterEach(() => {
  active.splice(0).forEach(actions => actions.dispose());
  vi.unstubAllGlobals();
});
it("新建仅预填，取消不写库且返回 null", async () => {
  const { actions, context, prepareContent } = setup();
  const pending = actions.run(context, owner, {
    action: "card.create",
    content: { markdown: "预填" },
    tags: ["标签"],
  });
  const request = pendingRequest(actions);
  await request.prepare();
  expect(prepareContent).toHaveBeenCalledWith(context, { markdown: "预填" });
  expect(invoke).not.toHaveBeenCalled();
  request.close();
  await expect(pending).resolves.toBeNull();
  expect(actions.getSnapshot()).toBeNull();
});
it.each(["card.create", "project.insertDocument"] as const)(
  "%s 确认写固定库并返回引用",
  async action => {
    const { actions, context, changed } = setup();
    vi.mocked(invoke).mockResolvedValue({ id: "9" });
    const pending = actions.run(context, owner, { action, content: { markdown: "正文" } });
    await pendingRequest(actions).submit(input);
    const entity = action === "card.create" ? "card" : "document";
    expect(invoke).toHaveBeenCalledWith("plugin_data_write", {
      database: "one.db",
      token: "one-token",
      pluginId: owner.id,
      request: {
        method: "create",
        entity,
        content: draft,
        input:
          entity === "card" ? { tags: ["标签"] } : { title: "文档", projectId: "1", parentId: "2" },
      },
    });
    await expect(pending).resolves.toEqual({ kind: entity, id: "9" });
    expect(changed).toHaveBeenCalledOnce();
  }
);
it("shareOf 预览核验所有权，提交保留共用引用", async () => {
  const { actions, context, ready } = setup();
  vi.mocked(invoke).mockResolvedValueOnce({ own: true }).mockResolvedValueOnce({ id: "7" });
  const pending = actions.run(context, owner, {
    action: "project.insertDocument",
    content: { shareOf: "3:4" },
  });
  const request = pendingRequest(actions);
  await request.prepare();
  await request.submit(input);
  expect(ready).toHaveBeenCalledTimes(2);
  expect(invoke).toHaveBeenLastCalledWith(
    "plugin_data_write",
    expect.objectContaining({ request: expect.objectContaining({ content: { shareOf: "3:4" } }) })
  );
  await expect(pending).resolves.toEqual({ kind: "document", id: "7" });
});
it("项目列表分页与位置查询固定工作区", async () => {
  const { actions, context } = setup();
  vi.mocked(invoke).mockResolvedValue({ items: [], nextCursor: "next" });
  const pending = actions.run(context, owner, {
    action: "project.insertDocument",
    content: { markdown: "正文" },
  });
  const request = pendingRequest(actions);
  await request.projects("cursor");
  expect(invoke).toHaveBeenLastCalledWith(
    "plugin_data_read",
    expect.objectContaining({
      database: "one.db",
      request: { method: "query", entity: "project", query: { limit: 40, cursor: "cursor" } },
    })
  );
  await request.tree("1");
  expect(invoke).toHaveBeenLastCalledWith(
    "plugin_data_read",
    expect.objectContaining({ request: { method: "projectTree", projectId: "1" } })
  );
  request.close();
  await pending;
});
it("手势、工作区与请求互斥检查", async () => {
  const { actions, context } = setup();
  vi.stubGlobal("navigator", { userActivation: { isActive: false } });
  expect(() => actions.run(context, owner, { action: "card.create" })).toThrow("用户点击");
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });
  expect(() =>
    actions.run({ ...context, workspaceId: "other.db" }, owner, { action: "card.create" })
  ).toThrow("工作区");
  expect(() => actions.run(context, owner, { action: "content.present", ref: "1:2" })).toThrow(
    "尚未开放"
  );
  const pending = actions.run(context, owner, { action: "card.create" });
  expect(() => actions.run(context, owner, { action: "card.create" })).toThrow("当前打开");
  pendingRequest(actions).close();
  await pending;
});
it.each(["abort", "dispose"])("正文准备期间 %s 不写库、不保留面板", async operation => {
  const { actions, context, lifetime, prepareContent } = setup();
  let finish!: (value: typeof draft) => void;
  prepareContent.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const pending = actions.run(context, owner, { action: "card.create" });
  const rejected = expect(pendingRequest(actions).submit(input)).rejects.toThrow();
  if (operation === "abort") lifetime.abort();
  else actions.dispose();
  finish(draft);
  await rejected;
  await expect(pending).resolves.toBeNull();
  expect(invoke).not.toHaveBeenCalled();
  expect(actions.getSnapshot()).toBeNull();
});
it("保存失败可重试，连点不会重复提交", async () => {
  const { actions, context } = setup();
  let reject!: (error: Error) => void;
  vi.mocked(invoke).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      })
  );
  const pending = actions.run(context, owner, { action: "card.create" });
  const request = pendingRequest(actions);
  const failed = expect(request.submit(input)).rejects.toThrow("写入失败");
  await expect(request.submit(input)).rejects.toThrow("正在保存");
  await Promise.resolve();
  request.close();
  expect(actions.getSnapshot()).toBe(request);
  reject(new Error("写入失败"));
  await failed;
  expect(actions.getSnapshot()).toBe(request);
  vi.mocked(invoke).mockResolvedValue({ id: "6" });
  await request.submit(input);
  await expect(pending).resolves.toEqual({ kind: "card", id: "6" });
});
it("协作只解析引用，关闭不发布，插件不收到正文", async () => {
  const { actions, context } = setup();
  vi.mocked(invoke).mockResolvedValue({
    own: false,
    owners: ["card"],
    document: { contentId: 1 },
    binding: "shared",
  });
  const pending = actions.run(context, owner, { action: "content.share", ref: "1:2" });
  const request = pendingRequest(actions);
  expect(invoke).not.toHaveBeenCalled();
  expect((await request.shareTarget()).binding).toBe("shared");
  request.close();
  await expect(pending).resolves.toBeUndefined();
});
it("已删除协作引用与已关闭面板的回调均拒绝", async () => {
  const { actions, context } = setup();
  vi.mocked(invoke).mockResolvedValue(null);
  const pending = actions.run(context, owner, { action: "content.share", ref: "1:2" });
  const request = pendingRequest(actions);
  await expect(request.shareTarget()).rejects.toThrow("不存在");
  request.close();
  await pending;
  await expect(request.shareTarget()).rejects.toThrow();
});

function pendingRequest(actions: ReturnType<typeof createMobileAppActions>) {
  const request = actions.getSnapshot();
  if (!request) throw new Error("预期存在宿主操作请求");
  return request;
}

it("公开 app.run 无需业务写权限，SDK 复制预填参数并返回新引用", async () => {
  const { actions } = setup();
  const app = createMobileApp(
    "one.db",
    "one-token",
    { push: vi.fn() },
    async () => false,
    undefined,
    actions
  );
  const host = new PluginHost({
    workspaceId: "one.db",
    storage: createMemoryStorage(),
    app: app.adapter,
  });
  let context!: PluginContext;
  host.registerTrusted(
    definePlugin({
      id: owner.id,
      name: owner.name,
      version: "1.0.0",
      create: () => ({
        activate(value) {
          context = value;
        },
      }),
    })
  );
  try {
    await host.enable(owner.id);
    const tags = ["原标签"];
    const pending = context.app.run("card.create", { content: { markdown: "预填" }, tags });
    tags.push("迟到修改");
    expect(pendingRequest(actions).input).toMatchObject({ tags: ["原标签"] });
    vi.mocked(invoke).mockResolvedValue({ id: "8" });
    await pendingRequest(actions).submit(input);
    await expect(pending).resolves.toEqual({ kind: "card", id: "8" });
  } finally {
    app.dispose();
    await host.dispose();
  }
});
