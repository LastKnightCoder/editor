import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createMobileData } from "./data";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { PluginPermissionBroker } from "@tau/plugins/permission-host";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { registerContentWriter } from "../../services/contentWriteCoordinator";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../services/pluginContentSession", () => ({
  readPluginSharedContent: vi.fn(),
  writePluginSharedContent: vi.fn(),
}));
const nodes = [{ type: "paragraph", children: [{ type: "formatted", text: "原文" }] }];
const original = {
  owners: ["card"],
  own: false,
  binding: null,
  document: {
    contentId: 1,
    createTime: 1,
    updateTime: 1,
    count: 2,
    content: nodes,
    contracts: {},
    revision: "revision-1",
    documentId: "document",
    librarySourceId: "library",
  },
};
const context = () =>
  ({ pluginId: "test.data", signal: new AbortController().signal }) as PluginContext;
beforeEach(() => vi.clearAllMocks());

it("真实 PluginHost 在授权前不执行查询，允许后使用固定库和 token", async () => {
  vi.mocked(invoke).mockResolvedValue({ items: [] });
  const broker = new PluginPermissionBroker({ read: async () => ({}), write: vi.fn() }, () => true);
  const data = createMobileData("one.db", "session-one", vi.fn());
  const host = new PluginHost({
    workspaceId: "one.db",
    storage: createMemoryStorage(),
    data,
    permissions: broker,
  });
  let plugin!: PluginContext;
  host.registerTrusted({
    ...definePlugin({
      id: "test.data",
      name: "测试",
      version: "1",
      create: () => ({
        activate(value) {
          plugin = value;
        },
      }),
    }),
    permissions: ["cards:read"],
  });
  await host.enable("test.data");
  const pending = plugin.data.cards.query({ limit: 2 });
  await vi.waitFor(() => expect(broker.prompts).toHaveLength(1));
  expect(invoke).not.toHaveBeenCalled();
  await broker.prompts[0].decide("once");
  expect(await pending).toEqual({ items: [] });
  expect(invoke).toHaveBeenCalledWith(
    "plugin_data_read",
    expect.objectContaining({
      database: "one.db",
      token: "session-one",
      pluginId: "test.data",
      request: expect.objectContaining({ entity: "card" }),
    })
  );
  await host.dispose();
  broker.dispose();
  data.dispose();
});
it("冲洗活动编辑器后重新比较版本，旧请求不覆盖新保存的输入", async () => {
  vi.mocked(invoke)
    .mockResolvedValueOnce(original)
    .mockResolvedValueOnce({
      ...original,
      document: { ...original.document, revision: "revision-2" },
    });
  const flush = vi.fn(async () => true);
  const stop = registerContentWriter("library", "document", { flush, clean: () => true });
  const data = createMobileData("one.db", "session", vi.fn());
  try {
    await expect(
      data.editContent(
        context(),
        "1:1",
        { op: "append", content: { markdown: "追加" } },
        "revision-1"
      )
    ).rejects.toMatchObject({ name: "PluginConflictError" });
    expect(flush).toHaveBeenCalledOnce();
    expect(vi.mocked(invoke).mock.calls.every(([name]) => name === "plugin_data_read")).toBe(true);
  } finally {
    stop();
    data.dispose();
  }
});
it("原生版本冲突映射为插件冲突错误，不伪造成功刷新", async () => {
  vi.mocked(invoke).mockRejectedValue("PLUGIN_CONFLICT: 已变化");
  const changed = vi.fn();
  const data = createMobileData("one.db", "session", changed);
  await expect(data.update(context(), "card", "1", { pinned: true }, "1")).rejects.toMatchObject({
    name: "PluginConflictError",
  });
  expect(changed).not.toHaveBeenCalled();
  data.dispose();
});
it("会话取消后的迟到读取不交给插件，释放后不能执行恢复", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const controller = new AbortController();
  const current = { ...context(), signal: controller.signal };
  const data = createMobileData("one.db", "session", vi.fn());
  const pending = data.get(current, "card", "1");
  controller.abort();
  finish({ id: "1" });
  await expect(pending).rejects.toThrow();
  data.dispose();
  await expect(data.restore("test.data", 1)).rejects.toThrow("会话已结束");
  expect(invoke).toHaveBeenCalledTimes(1);
});
it("不支持的业务接口不会落到普通当前库命令", async () => {
  const data = createMobileData("one.db", "session", vi.fn());
  await expect(data.notebookResources(context(), "1")).rejects.toThrow("尚未提供");
  expect(invoke).not.toHaveBeenCalled();
  data.dispose();
});

it("replaceText 拒绝重叠的多处命中，不发出正文写入", async () => {
  vi.mocked(invoke).mockResolvedValue({
    ...original,
    document: {
      ...original.document,
      content: [{ type: "paragraph", children: [{ type: "formatted", text: "aaa" }] }],
    },
  });
  const data = createMobileData("one.db", "session", vi.fn());
  try {
    await expect(
      data.editContent(
        context(),
        "1:1",
        { op: "replaceText", find: "aa", markdown: "替换" },
        "revision-1"
      )
    ).rejects.toThrow("恰好出现一次");
    expect(vi.mocked(invoke).mock.calls.every(([name]) => name === "plugin_data_read")).toBe(true);
  } finally {
    data.dispose();
  }
});
