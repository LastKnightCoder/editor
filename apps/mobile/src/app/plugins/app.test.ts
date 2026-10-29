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
    app.adapter.open(
      context(),
      { kind: "project", id: "1" },
      { placement: "page", at: { block: 1 } }
    )
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

it.each(["card", "article", "document"] as const)(
  "%s 原生解析后传递块位置，不授予正文权限",
  async kind => {
    const { app, push, canRead } = setup();
    vi.mocked(invoke).mockResolvedValue({ kind, id: 12 });
    await app.adapter.open(context(), { kind, id: "12" }, { placement: "page", at: { block: 4 } });
    expect(invoke).toHaveBeenCalledWith(
      "plugin_app_refs",
      expect.objectContaining({ request: { method: "resolve", ref: { kind, id: "12" } } })
    );
    expect(push).toHaveBeenCalledWith(
      kind === "card" ? "contentDetail" : kind === "article" ? "articleEditor" : "projectDocEditor",
      expect.objectContaining({ block: 4, locationRequestId: expect.any(String) })
    );
    expect(canRead).not.toHaveBeenCalled();
  }
);

it("日记选择只交付引用与标题，创建身份和日期说明留在宿主", async () => {
  const { app, push, canRead } = setup();
  const item: MobileEntityCandidate = {
    ref: { kind: "diary", id: "8" },
    title: "日记摘要",
    identity: "123",
    subtitle: "2026-10-29",
  };
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "plugin_app_query") return { items: [item] };
    const method = (args as { request: { method: string } }).request.method;
    if (method === "grant")
      return [
        { ref: item.ref, title: item.title, identity: item.identity, subtitle: item.subtitle },
      ];
    if (method === "describe") return [{ status: "ok", title: item.title }];
    return { kind: "diary", id: 8, contentId: 88, diaryType: "daily", date: "2026-10-29" };
  });
  const pending = app.adapter.pick(context(), owner, {
    kinds: ["diary"],
    multiple: false,
    title: "选择日记",
  });
  const request = app.getSnapshot();
  if (!request) throw new Error("选择器未打开");
  const page = await request.query({
    kind: "diary",
    keyword: "2026-10",
    limit: 20,
    signal: new AbortController().signal,
  });
  expect(page.items[0].subtitle).toBe("2026-10-29");
  await request.submit(page.items);
  await expect(pending).resolves.toEqual([{ ref: item.ref, title: item.title }]);
  await expect(app.adapter.describe(context(), [item.ref], [])).resolves.toEqual([
    { status: "ok", title: item.title },
  ]);
  await app.adapter.open(context(), item.ref, { placement: "page" });
  expect(push).toHaveBeenCalledWith(
    "contentDetail",
    expect.objectContaining({ contentId: 88, fromDiary: true })
  );
  expect(canRead).not.toHaveBeenCalled();
});

it("日记打开在切库后不使用迟到的导航结果", async () => {
  const { app, push } = setup();
  let finish: (value: unknown) => void = () => undefined;
  vi.mocked(invoke).mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const pending = app.adapter.open(context(), { kind: "diary", id: "8" }, { placement: "page" });
  const rejected = expect(pending).rejects.toThrow("工作区已失效");
  app.dispose();
  finish({ kind: "diary", id: 8, contentId: 88, diaryType: "daily", date: "2026-10-29" });
  await rejected;
  expect(push).not.toHaveBeenCalled();
});
