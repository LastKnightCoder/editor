/**
 * 独立微信读书发布包的真实入口经桌面运行时加载：与本地插件同一条打包 → 延迟加载 → 启用路径，
 * 验证页面、侧边栏、设置、命令与摘录提供方的接线，以及打开原处回到插件单书页。
 */
import { act } from "react";
import { pluginArtifact } from "../../../test-fixtures/plugin-packages";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import { DesktopPluginRuntime, PLUGIN_PAGE_KEY } from "@/app/plugins/runtime";
import { registerPluginPackage } from "@/app/plugins/package-loader";
import { createDesktopExcerpts } from "@/app/plugins/excerpts";
import { sharedPluginModules } from "@/app/plugins/shared-modules";
import { openExcerptAtProvider } from "@/services/excerpt-providers";

const invoke = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined as unknown));
vi.mock("@/electron", () => ({
  invoke,
  isElectron: true,
  platform: "darwin",
  on: vi.fn(),
  off: vi.fn(),
}));

const artifact = pluginArtifact("weread");

const runtimes: DesktopPluginRuntime[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose();
  invoke.mockClear();
  vi.unstubAllGlobals();
});

async function setup() {
  const push = vi.fn();
  const openSettings = vi.fn();
  const runtime = new DesktopPluginRuntime({
    workspaceId: "w",
    storage: createMemoryStorage(),
    navigator: { push },
    plugins: [],
    openSettings,
    ...createDesktopExcerpts("data.db"),
  });
  runtimes.push(runtime);
  registerPluginPackage(runtime.host, artifact, async () => sharedPluginModules);
  await runtime.host.enable("weread");
  return { runtime, push, openSettings };
}

describe("微信读书插件", () => {
  it("未建立私有书架缓存也能通过真实单书组件展示迁移保留的摘录", async () => {
    // jsdom 没有 CSS.escape；本例只使用无需转义的 bm_1。
    const escape = vi.fn((value: string) => value);
    vi.stubGlobal("CSS", { escape });
    invoke.mockImplementation(async (channel: unknown) => {
      if (channel === "excerpt:sources") return [{ key: "b1", title: "迁移保留的书", count: 1 }];
      if (channel === "excerpt:items")
        return [
          {
            id: 7,
            externalId: "b1:bm_1",
            quote: "迁移保留的原文",
            note: "想法",
            location: "第一章",
            url: null,
            anchor: { chapterUid: 1, chapterIdx: 1, range: "1-5" },
            color: null,
            sourceTime: null,
            isDeleted: false,
          },
        ];
      return undefined;
    });
    const { runtime } = await setup();
    const page = runtime.getPage("weread", "book");
    if (!page) throw new Error("单书页未注册");
    const Component = page.definition.component;
    const host = document.createElement("div");
    document.body.append(host);
    const view = createRoot(host);
    try {
      await act(async () =>
        view.render(
          <Component
            context={page.context}
            params={{ bookId: "b1", bookmark: "bm_1" }}
            pageContext={{ register: () => ({ dispose: () => undefined }) }}
          />
        )
      );
      await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
      expect(host.textContent).toContain("迁移保留的书");
      expect(host.textContent).toContain("迁移保留的原文");
      expect(host.querySelector('[data-note-id="bm_1"]')).not.toBeNull();
      expect(escape).toHaveBeenCalledWith("bm_1");
      expect(host.textContent).not.toContain("书架上找不到这本书");
    } finally {
      act(() => view.unmount());
      host.remove();
      invoke.mockImplementation(async () => undefined);
    }
  });
  it("启用后贡献书架与单书页、学习分组入口、设置分区、命令和摘录提供方", async () => {
    const { runtime } = await setup();
    expect(runtime.host.getState("weread")).toBe("active");
    expect(runtime.listSidebar().items).toMatchObject([
      { title: "微信读书", group: "learning", pluginId: "weread", pageId: "shelf" },
    ]);
    expect(runtime.getPage("weread", "book")).toBeTruthy();
    expect(runtime.listSettings().map(item => item.definition.title)).toEqual(["账号与连接"]);
    expect(runtime.host.listCommands().map(command => command.id)).toEqual([
      "weread:open",
      "weread:sync",
    ]);
    expect(invoke).toHaveBeenCalledWith("excerpt:register-provider", "weread", "微信读书");
  });

  it("从脉络、搜索打开摘录：交给插件单书页并定位到划线或想法", async () => {
    const { push } = await setup();
    const target = {
      page: "excerpt-provider" as const,
      sourceType: "weread",
      sourceKey: "b1",
      label: "微信读书",
      url: null,
    };
    await openExcerptAtProvider({ ...target, externalId: "b1:bm_1" });
    await openExcerptAtProvider({ ...target, externalId: "b1:review:r9" });
    expect(push.mock.calls.map(([key, params]) => [key, params.pageId, params.params])).toEqual([
      [PLUGIN_PAGE_KEY, "book", JSON.stringify({ bookId: "b1", bookmark: "bm_1" })],
      [PLUGIN_PAGE_KEY, "book", JSON.stringify({ bookId: "b1", bookmark: "r9" })],
    ]);
  });

  it("首次未配置时书架引导填写 API Key；停用后打开原处回落外链", async () => {
    const { runtime } = await setup();
    const page = runtime.getPage("weread", "shelf")!;
    const Component = page.definition.component;
    const host = document.createElement("div");
    document.body.append(host);
    const view = createRoot(host);
    await act(async () =>
      view.render(
        <Component
          context={page.context}
          params={{}}
          pageContext={{ register: () => ({ dispose: () => undefined }) }}
        />
      )
    );
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    expect(host.textContent).toContain("把微信读书的书架和笔记带进来");
    act(() => view.unmount());
    host.remove();
    await runtime.host.disable("weread");
    await expect(
      openExcerptAtProvider({
        page: "excerpt-provider",
        sourceType: "weread",
        sourceKey: "b1",
        externalId: "b1:1",
        label: "微信读书",
        url: null,
      })
    ).rejects.toThrow("需启用「微信读书」插件");
  });
});
