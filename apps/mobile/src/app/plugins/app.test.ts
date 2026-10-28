import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { definePlugin, type PluginContext, type PluginPickOptions } from "@tau/plugins";
import { createMemoryStorage, PluginHost } from "@tau/plugins/host";
import { createMobileApp } from "./app";
import type { MobileEntityCandidate } from "./app-types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const candidate: MobileEntityCandidate = {
  ref: { kind: "card", id: "1" },
  title: "卡片",
  identity: "123",
};
const options: Required<PluginPickOptions> = { kinds: ["card"], multiple: false, title: "关联" };
const context = (signal = new AbortController().signal) =>
  ({ pluginId: "test.picker", workspaceId: "one.db", signal }) as PluginContext;
const owner = { id: "test.picker", name: "测试插件" };
const apps: ReturnType<typeof createMobileApp>[] = [];
const setup = (canRead = vi.fn(async () => false)) => {
  const push = vi.fn();
  const app = createMobileApp("one.db", "session-one", { push }, canRead);
  apps.push(app);
  return { app, push, canRead };
};
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });
});
afterEach(() => {
  apps.splice(0).forEach(app => app.dispose());
  vi.unstubAllGlobals();
});

it("没有用户手势不打开选择器或导航，未支持组合不调用原生", async () => {
  const { app, push } = setup();
  vi.stubGlobal("navigator", { userActivation: { isActive: false } });
  expect(() => app.adapter.pick(context(), owner, options)).toThrow("用户点击");
  await expect(app.adapter.open(context(), candidate.ref, { placement: "page" })).rejects.toThrow(
    "用户点击"
  );
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });
  expect(() => app.adapter.pick(context(), owner, { ...options, kinds: ["whiteboard"] })).toThrow(
    "尚未开放"
  );
  await expect(app.adapter.open(context(), candidate.ref, { placement: "window" })).rejects.toThrow(
    "仅支持"
  );
  await expect(
    app.adapter.open(context(), candidate.ref, { placement: "page", at: { block: 1 } })
  ).rejects.toThrow("正文块位置");
  expect(invoke).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
});

it("选择只登记明确确认的引用身份，插件结果不包含私有 identity", async () => {
  const { app, canRead } = setup();
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_app_query"
      ? { items: [candidate], nextCursor: "next" }
      : [{ ref: candidate.ref, title: "最新标题", identity: "123" }]
  );
  const pending = app.adapter.pick(context(), owner, options);
  const request = app.getSnapshot()!;
  expect(invoke).not.toHaveBeenCalled();
  const page = await request.query({
    kind: "card",
    keyword: "卡",
    limit: 20,
    signal: new AbortController().signal,
  });
  expect(page.nextCursor).toBe("next");
  expect(invoke).toHaveBeenCalledWith(
    "plugin_app_query",
    expect.objectContaining({ database: "one.db", token: "session-one", pluginId: owner.id })
  );
  await request.submit(page.items);
  await expect(pending).resolves.toEqual([{ ref: candidate.ref, title: "最新标题" }]);
  expect(invoke).toHaveBeenLastCalledWith(
    "plugin_app_refs",
    expect.objectContaining({
      request: { method: "grant", selections: [{ ref: candidate.ref, identity: "123" }] },
    })
  );
  expect(canRead).not.toHaveBeenCalled();
  expect(request.signal.aborted).toBe(true);
  expect(app.getSnapshot()).toBeNull();
});

it("取消和停用不登记引用，迟到查询不能重开窗口或继续确认", async () => {
  const { app } = setup();
  const controller = new AbortController();
  const pending = app.adapter.pick(context(controller.signal), owner, options);
  const request = app.getSnapshot()!;
  let finish!: (result: unknown) => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
  const query = request.query({
    kind: "card",
    keyword: "",
    limit: 20,
    signal: new AbortController().signal,
  });
  controller.abort();
  finish({ items: [candidate] });
  await expect(query).rejects.toThrow();
  await expect(pending).resolves.toEqual([]);
  await expect(request.submit([candidate])).rejects.toThrow();
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(app.getSnapshot()).toBeNull();
});

it("选择请求互斥、只能确认已返回候选，确认失败保留窗口供重试", async () => {
  const { app } = setup();
  const pending = app.adapter.pick(context(), owner, options);
  const request = app.getSnapshot()!;
  expect(() => app.adapter.pick(context(), owner, options)).toThrow("完成或取消");
  await expect(request.submit([candidate])).rejects.toThrow("重新搜索");
  vi.mocked(invoke).mockResolvedValueOnce({ items: [candidate] });
  await request.query({ kind: "card", keyword: "", limit: 20, signal: request.signal });
  vi.mocked(invoke).mockRejectedValueOnce(new Error("内容身份已变化"));
  await expect(request.submit([candidate])).rejects.toThrow("身份已变化");
  expect(app.getSnapshot()).toBe(request);
  request.cancel();
  await expect(pending).resolves.toEqual([]);
});

it("已确认提交期间取消不伪装成未授权，结果确认后才收束", async () => {
  const { app } = setup();
  const pending = app.adapter.pick(context(), owner, options);
  const request = app.getSnapshot()!;
  vi.mocked(invoke).mockResolvedValueOnce({ items: [candidate] });
  await request.query({ kind: "card", keyword: "", limit: 20, signal: request.signal });
  let finish!: (result: unknown) => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
  const submitting = request.submit([candidate]);
  request.cancel();
  expect(app.getSnapshot()).toBe(request);
  expect(request.signal.aborted).toBe(false);
  finish([{ ref: candidate.ref, title: candidate.title }]);
  await submitting;
  await expect(pending).resolves.toEqual([{ ref: candidate.ref, title: candidate.title }]);
  expect(app.getSnapshot()).toBeNull();
});

it("确认在途的会话终结仍强制关闭，不把迟到授权结果交给旧插件", async () => {
  const { app } = setup();
  const pending = app.adapter.pick(context(), owner, options);
  const request = app.getSnapshot()!;
  vi.mocked(invoke).mockResolvedValueOnce({ items: [candidate] });
  await request.query({ kind: "card", keyword: "", limit: 20, signal: request.signal });
  let finish!: (result: unknown) => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
  const submitting = request.submit([candidate]);
  app.dispose();
  await expect(pending).resolves.toEqual([]);
  expect(app.getSnapshot()).toBeNull();
  finish([{ ref: candidate.ref, title: candidate.title }]);
  await expect(submitting).rejects.toThrow("工作区已失效");
});

it("describe 不询问权限，撤回后的迟到标题不交付", async () => {
  const { app, canRead } = setup();
  vi.mocked(invoke).mockResolvedValueOnce([{ status: "denied" }]);
  await expect(app.adapter.describe(context(), [candidate.ref], ["card"])).resolves.toEqual([
    { status: "denied" },
  ]);
  expect(invoke).toHaveBeenLastCalledWith(
    "plugin_app_refs",
    expect.objectContaining({
      request: { method: "describe", refs: [candidate.ref], readable: [] },
    })
  );
  canRead.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  vi.mocked(invoke).mockResolvedValueOnce([{ status: "ok", title: "不能泄露" }]);
  await expect(app.adapter.describe(context(), [candidate.ref], ["card"])).rejects.toThrow(
    "授权已变化"
  );
});

it("打开只消费经原生验证的目标，失效会话不发生迟到导航", async () => {
  const { app, push } = setup();
  vi.mocked(invoke).mockResolvedValueOnce({ kind: "todo", id: 7, groupId: 9 });
  await app.adapter.open(
    context(),
    { kind: "todo", id: "todo:7:1@2026-10-28" },
    { placement: "page" }
  );
  expect(push).toHaveBeenCalledWith("todoDetail", { todoId: 7, groupId: 9 });
  let finish!: (result: unknown) => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
  const opening = app.adapter.open(context(), candidate.ref, { placement: "page" });
  app.dispose();
  finish({ kind: "card", id: 1 });
  await expect(opening).rejects.toThrow("工作区已失效");
  expect(push).toHaveBeenCalledTimes(1);
});

it("公共宿主未声明权限时仍可由用户选择引用，但不能批量获取整类内容", async () => {
  const { app } = setup();
  const host = new PluginHost({
    workspaceId: "one.db",
    storage: createMemoryStorage(),
    app: app.adapter,
  });
  let ctx!: PluginContext;
  host.registerTrusted(
    definePlugin({
      id: owner.id,
      name: owner.name,
      version: "1",
      create: () => ({
        activate(value) {
          ctx = value;
        },
      }),
    })
  );
  await host.enable(owner.id);
  try {
    const pending = ctx.app.pick({ kinds: ["card"] });
    app.getSnapshot()!.cancel();
    await expect(pending).resolves.toEqual([]);
    vi.mocked(invoke).mockResolvedValueOnce([{ status: "ok", title: "曾选择的卡片" }]);
    await expect(ctx.app.describe([candidate.ref])).resolves.toEqual([
      { ref: candidate.ref, status: "ok", title: "曾选择的卡片" },
    ]);
    await expect(ctx.app.run("card.create", {})).rejects.toThrow("尚未开放");
  } finally {
    await host.dispose();
  }
});
