// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "@tau/ui";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { createMobileExcerpts, type MobileExcerptMaterial } from "./excerpts";
import { MobilePluginRuntime } from "./runtime";
import type { MobileDataAdapter } from "./data";
import { createExcerptMaterialRef } from "@tau/plugins/material-ref";
import { installMobileExcerptHost, openMobileExcerpt } from "../../services/excerpts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const target: MobileExcerptMaterial = {
  sourceType: "weread",
  sourceKey: "book",
  title: "书",
  label: "微信读书",
  createdAt: 10,
  updatedAt: 20,
  entry: {
    ref: createExcerptMaterialRef(7, "weread", "book:mark"),
    externalId: "book:mark",
    quote: "第一段\n第二段",
    note: "想法",
    location: "章节",
    url: "https://example.com/book",
    anchor: null,
    color: null,
    time: null,
    deleted: false,
  },
};
const cleanups: (() => unknown | Promise<unknown>)[] = [];
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(openUrl).mockReset();
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (
      command === "excerpt_open_target" ||
      (args as { request?: { method: string } })?.request?.method === "material"
    )
      return structuredClone(target);
    return null;
  });
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks();
});

async function setup() {
  const runtime = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "ios",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "one.db",
    { push: vi.fn() },
    "0.2.16"
  );
  const prepareContent = vi.fn<MobileDataAdapter["prepareContent"]>().mockResolvedValue({
    nodes: [],
    contracts: {},
    count: 1,
  });
  const changed = vi.fn();
  const service = createMobileExcerpts("one.db", "session", { prepareContent }, changed);
  runtime.excerpts = service;
  let context!: PluginContext;
  runtime.host.registerTrusted(
    definePlugin({
      id: "weread",
      name: "微信读书",
      version: "1",
      create: () => ({
        activate: current => {
          context = current;
        },
      }),
    })
  );
  await runtime.host.enable("weread");
  cleanups.push(() => runtime.dispose());
  return { service, runtime, context, prepareContent, changed };
}

it("真实移动运行时接线：写入等待提供方登记，登记失败不继续写入", async () => {
  let fail!: (error: Error) => void;
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    if ((args as { request: { method: string } }).request.method === "register")
      return new Promise((_resolve, reject) => {
        fail = reject;
      });
  });
  const { context } = await setup();
  context.excerpts.register({ label: "微信读书" });
  const pending = context.excerpts.replace({ key: "book", title: "书" }, []);
  await Promise.resolve();
  expect(invoke).toHaveBeenCalledTimes(1);
  fail(new Error("登记失败"));
  await expect(pending).rejects.toThrow("登记失败");
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("登记、读回与增量均固定库和插件；注销后不能继续写入", async () => {
  const { context } = await setup();
  const provider = context.excerpts.register({ label: "微信读书" });
  await context.excerpts.patch({ key: "book", title: "书" }, { remove: ["book:mark"] });
  await context.excerpts.sources();
  await context.excerpts.items("book");
  for (const [command, args] of vi.mocked(invoke).mock.calls) {
    expect(command).toBe("plugin_excerpts");
    expect(args).toMatchObject({ database: "one.db", token: "session", pluginId: "weread" });
  }
  await provider.dispose();
  await expect(context.excerpts.replace({ key: "book", title: "书" }, [])).rejects.toThrow(
    "先注册"
  );
});

it("提供方优先打开，注销后回落到外链，无外链给出启用提示", async () => {
  const { context, service } = await setup();
  const open = vi.fn();
  const provider = context.excerpts.register({ label: "微信读书", open });
  await service.open(7);
  expect(open).toHaveBeenCalledWith({ sourceKey: "book", externalId: "book:mark" });
  expect(openUrl).not.toHaveBeenCalled();
  await provider.dispose();
  await service.open(7);
  expect(openUrl).toHaveBeenCalledWith(target.entry.url);
  vi.mocked(invoke).mockResolvedValueOnce({ ...target, entry: { ...target.entry, url: null } });
  await expect(service.open(7)).rejects.toThrow("启用「微信读书」");
});

it("切换宿主时迟到的摘录解析不能触发提供方或外链", async () => {
  const { service } = await setup();
  const stop = installMobileExcerptHost(service);
  cleanups.push(stop);
  let release!: (value: MobileExcerptMaterial) => void;
  vi.mocked(invoke).mockReturnValueOnce(
    new Promise(resolve => {
      release = resolve;
    })
  );
  const pending = openMobileExcerpt(7);
  stop();
  release(target);
  await expect(pending).rejects.toThrow("已切换");
  expect(openUrl).not.toHaveBeenCalled();
});

it("转卡片保留引用块、想法、出处，使用同一次材料快照原子提交", async () => {
  const success = vi.spyOn(toast, "success");
  const { context, prepareContent, changed } = await setup();
  const [action] = await context.materials.actions(target.entry.ref);
  await action.run();
  expect(prepareContent).toHaveBeenCalledWith(context, {
    markdown: "> 第一段\n> 第二段\n\n想法\n\n—— 微信读书 · 书 · 章节",
  });
  expect(invoke).toHaveBeenCalledWith("plugin_material_card", {
    database: "one.db",
    token: "session",
    pluginId: "weread",
    request: {
      ref: target.entry.ref,
      expected: target,
      content: { nodes: [], contracts: {}, count: 1 },
    },
  });
  expect(changed).toHaveBeenCalledOnce();
  expect(success).toHaveBeenCalledWith("已转为卡片");
});

it("正文准备期间停用插件，旧材料动作不能继续提交卡片", async () => {
  const { context, runtime, prepareContent } = await setup();
  let release!: (value: Awaited<ReturnType<typeof prepareContent>>) => void;
  prepareContent.mockReturnValueOnce(
    new Promise(resolve => {
      release = resolve;
    })
  );
  const [action] = await context.materials.actions(target.entry.ref);
  const pending = action.run();
  await vi.waitFor(() => expect(prepareContent).toHaveBeenCalledOnce());
  await runtime.host.disable("weread");
  release({ nodes: [], contracts: {}, count: 1 });
  await expect(pending).rejects.toThrow();
  expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "plugin_material_card")).toBe(
    false
  );
});

it("同步归并后编号被另一条摘录占用，旧动作不能转错材料", async () => {
  const error = vi.spyOn(toast, "error");
  const { context, prepareContent } = await setup();
  const [action] = await context.materials.actions(target.entry.ref);
  vi.mocked(invoke).mockResolvedValueOnce({
    ...target,
    entry: { ...target.entry, externalId: "other:mark" },
  });
  await action.run();
  expect(error).toHaveBeenCalledWith("摘录身份已变化，请重新获取材料动作");
  expect(prepareContent).not.toHaveBeenCalled();
});

it("获取动作前缓存编号已经过期时，稳定身份不匹配的响应不得继续转换", async () => {
  const { context, prepareContent } = await setup();
  vi.mocked(invoke).mockResolvedValueOnce({
    ...target,
    entry: { ...target.entry, externalId: "other:mark" },
  });
  await expect(context.materials.actions(target.entry.ref)).rejects.toThrow("身份不匹配");
  expect(prepareContent).not.toHaveBeenCalled();
});
