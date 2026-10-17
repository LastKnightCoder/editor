import { beforeEach, describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { createMemoryStorage, PluginHost } from "@tau/plugins/host";
import { createDesktopExcerpts } from "@/app/plugins/excerpts";
import { openExcerptAtProvider } from "@/services/excerpt-providers";
import { currentCommandScope } from "@/services/command-context";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  openExternal: vi.fn(),
  convert: vi.fn(),
  question: vi.fn(),
}));
vi.mock("@/electron", () => ({ invoke: mocks.invoke, isElectron: true }));
vi.mock("@/commands/extra", () => ({ openExternal: mocks.openExternal }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: "A.db" } } }) },
}));
vi.mock("@/services/material-to-card", () => ({ convertMaterialToCard: mocks.convert }));
vi.mock("@/services/question-capture", () => ({ requestMaterialQuestionCapture: mocks.question }));

const target = {
  page: "excerpt-provider" as const,
  sourceType: "weread",
  sourceKey: "b1",
  externalId: "b1:1",
  label: "微信读书",
  url: "https://weread.qq.com/web/reader/x",
};

async function setup() {
  let context!: PluginContext;
  const host = new PluginHost({
    workspaceId: "uuid",
    storage: createMemoryStorage(),
    ...createDesktopExcerpts("A.db"),
  });
  host.registerTrusted(
    definePlugin({
      id: "weread",
      name: "微信读书",
      version: "1.0.0",
      create: () => ({ activate: ctx => void (context = ctx) }),
    })
  );
  await host.enable("weread");
  return { host, context: () => context };
}

const scopes: (string | undefined)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  scopes.length = 0;
  mocks.invoke.mockImplementation(async (channel: string) => {
    scopes.push(currentCommandScope()?.databaseName);
    if (channel === "excerpt:items")
      return [
        {
          id: 7,
          externalId: "b1:1",
          isDeleted: false,
          quote: "甲",
          note: "",
          location: "第一章",
          url: null,
          anchor: { range: "1-2" },
          color: null,
          sourceTime: 5,
        },
      ];
    if (channel === "excerpt:replace") return { inserted: 1, updated: 0, deleted: 0 };
    return undefined;
  });
});

describe("桌面摘录提供方适配", () => {
  it("来源类型取插件 ID，写入固定到宿主创建时的数据库，先登记名称再写入", async () => {
    const { context } = await setup();
    context().excerpts.register({ label: "微信读书" });
    await context().excerpts.replace({ key: "b1", title: "书" }, [
      { externalId: "b1:1", quote: "甲" },
    ]);
    expect(mocks.invoke.mock.calls.map(call => call[0])).toEqual([
      "excerpt:register-provider",
      "excerpt:replace",
    ]);
    expect(mocks.invoke.mock.calls[0]).toEqual(["excerpt:register-provider", "weread", "微信读书"]);
    expect(mocks.invoke.mock.calls[1].slice(1)).toEqual([
      "weread",
      { key: "b1", title: "书" },
      [{ externalId: "b1:1", quote: "甲" }],
    ]);
    expect(scopes).toEqual(["A.db", "A.db"]);
    expect(await context().excerpts.items("b1")).toEqual([
      {
        ref: { kind: "excerpt", id: 7 },
        externalId: "b1:1",
        quote: "甲",
        note: "",
        location: "第一章",
        url: null,
        anchor: { range: "1-2" },
        color: null,
        time: 5,
        deleted: false,
      },
    ]);
  });

  it("名称登记失败时写入一并报错", async () => {
    mocks.invoke.mockRejectedValueOnce(new Error("名称无效"));
    const { context } = await setup();
    context().excerpts.register({ label: "微信读书" });
    await expect(context().excerpts.replace({ key: "b1", title: "" }, [])).rejects.toThrow(
      "名称无效"
    );
  });

  it("打开原处交给已启用的提供方；停用后回落外链", async () => {
    const opened: unknown[] = [];
    const { host, context } = await setup();
    context().excerpts.register({ label: "微信读书", open: value => void opened.push(value) });
    await openExcerptAtProvider(target);
    expect(opened).toEqual([{ sourceKey: "b1", externalId: "b1:1" }]);
    await host.disable("weread");
    await openExcerptAtProvider(target);
    expect(mocks.openExternal).toHaveBeenCalledWith(target.url);
    expect(opened).toHaveLength(1);
  });

  it("未提供 open 的提供方不接管打开", async () => {
    const { context } = await setup();
    context().excerpts.register({ label: "微信读书" });
    await openExcerptAtProvider(target);
    expect(mocks.openExternal).toHaveBeenCalledWith(target.url);
  });

  it("材料动作走客户端既有流程，非法地址拒绝", async () => {
    const { context } = await setup();
    const actions = await context().materials.actions({ kind: "excerpt", id: 7 });
    expect(actions.map(action => action.id)).toEqual(["card", "question"]);
    await actions[0].run();
    await actions[1].run();
    const scope = { databaseName: "A.db", signal: context().signal };
    expect(mocks.convert).toHaveBeenCalledWith({ kind: "excerpt", id: 7 }, scope);
    expect(mocks.question).toHaveBeenCalledWith({ kind: "excerpt", id: 7 }, scope);
    await expect(context().materials.actions({ kind: "card", id: 1 })).rejects.toThrow(
      "材料地址无效"
    );
  });
});
