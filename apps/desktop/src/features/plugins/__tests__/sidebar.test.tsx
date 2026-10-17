import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  definePlugin,
  SIDEBAR_GROUPS,
  type PluginContext,
  type PluginSidebarIconProps,
} from "@tau/plugins";
import { Plug } from "lucide-react";
import { createMemoryStorage } from "@tau/plugins/host";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { composeNavSections, isNavItemActive } from "@/app/navigation";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { Sidebar } from "@/app/Sidebar";
import { PageProvider, usePage } from "@/page/PageProvider";
import { PageHost } from "@/page/PageHost";
import { definePage } from "@/page/definePage";
import { useShellStore } from "@/app/shellStore";
import "../pages/plugin-page.page";

vi.mock("@/app/navSlots", () => ({
  NAV_BADGE_SLOTS: {},
  NAV_CHILDREN_SLOTS: {},
  useNavChildrenContent: () => ({}),
}));
vi.mock("@/app/WindowControls", () => ({ MacTrafficLights: () => null }));
vi.mock("@/app/useFullScreen", () => ({ useFullScreen: () => false }));
vi.mock("@/features/notifications/notify", () => ({ appNotify: vi.fn() }));

definePage({ key: "home", label: "首页", params: {}, component: () => <p>首页</p> });
const runtimes: DesktopPluginRuntime[] = [];
const makeRuntime = () => {
  const runtime = new DesktopPluginRuntime({
    workspaceId: "sidebar",
    storage: createMemoryStorage(),
    navigator: { push: vi.fn() },
    plugins: [],
  });
  runtimes.push(runtime);
  return runtime;
};
async function activate(
  runtime: DesktopPluginRuntime,
  id: string,
  setup?: (context: PluginContext) => void
) {
  let context!: PluginContext;
  runtime.host.registerTrusted(
    definePlugin({
      id,
      name: id,
      version: "1",
      create: () => ({
        activate(ctx) {
          context = ctx;
          setup?.(ctx);
        },
      }),
    })
  );
  await runtime.host.enable(id);
  return context;
}
const pageDefinition = { id: "page", title: "页面", component: () => <p>插件正文</p> };
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose();
});

describe("插件侧边栏", () => {
  it("已有分组、独立同名分组、缺失分组回落，空组不显示", async () => {
    const runtime = makeRuntime();
    const a = await activate(runtime, "author.a");
    const b = await activate(runtime, "author.b");
    const pa = a.pages.register(pageDefinition);
    const pb = b.pages.register(pageDefinition);
    const ga = a.sidebar.registerGroup({ id: "habits", title: "习惯" });
    const gb = b.sidebar.registerGroup({ id: "habits", title: "习惯" });
    a.sidebar.registerGroup({ id: "empty", title: "空组" });
    a.sidebar.registerItem({
      id: "daily",
      title: "日常入口",
      group: SIDEBAR_GROUPS.daily,
      page: pa,
    });
    a.sidebar.registerItem({ id: "custom", title: "A", group: ga.id, page: pa });
    b.sidebar.registerItem({ id: "custom", title: "B", group: gb.id, page: pb });
    a.sidebar.registerItem({ id: "unknown", title: "回落", group: "missing", page: pa });
    const sections = () => composeNavSections(runtime.listSidebar());
    expect(
      sections()
        .find(s => s.id === "daily")
        ?.items.at(-1)?.icon
    ).toBe(Plug);
    expect(
      sections()
        .find(s => s.id === "daily")
        ?.items.at(-1)?.label
    ).toBe("日常入口");
    expect(
      sections()
        .filter(s => s.label === "习惯")
        .map(s => s.collapseKey)
    ).toEqual([ga.id, gb.id]);
    expect(sections().some(s => s.label === "空组")).toBe(false);
    expect(
      sections()
        .find(s => s.id === "plugins")
        ?.items.map(i => i.label)
    ).toEqual(["回落"]);
    await ga.dispose();
    expect(
      sections()
        .find(s => s.id === "plugins")
        ?.items.map(i => i.label)
    ).toEqual(["A", "回落"]);
    await runtime.host.disable("author.a");
    expect(runtime.listSidebar().items.map(i => i.title)).toEqual(["B"]);
  });

  it("拒绝他人、伪造和失效页面，重复注册不覆盖，注销页面自动移除入口", async () => {
    const runtime = makeRuntime();
    const a = await activate(runtime, "a");
    const b = await activate(runtime, "b");
    const page = a.pages.register(pageDefinition);
    const group = a.sidebar.registerGroup({ id: "group", title: "组" });
    const item = { id: "item", title: "入口", page };
    expect(() => b.sidebar.registerItem(item)).toThrow("有效页面");
    expect(() => a.sidebar.registerItem({ ...item, page: { ...page } })).toThrow("有效页面");
    expect(() =>
      b.sidebar.registerItem({ ...item, page: b.pages.register(pageDefinition), group: group.id })
    ).toThrow("其他插件");
    a.sidebar.registerItem(item);
    expect(() => a.sidebar.registerItem(item)).toThrow("已注册");
    expect(() => a.sidebar.registerGroup({ id: "group", title: "覆盖" })).toThrow("已注册");
    await page.dispose();
    expect(runtime.listSidebar().items).toHaveLength(0);
    expect(() => a.sidebar.registerItem({ ...item, id: "new" })).toThrow("有效页面");
    await runtime.host.disable("a");
    expect(() => a.sidebar.registerGroup({ id: "late", title: "过期" })).toThrow();
  });

  it("按页面实例匹配高亮，打开使用注册时的参数快照", async () => {
    const runtime = makeRuntime();
    const ctx = await activate(runtime, "a");
    const page = ctx.pages.register({
      ...pageDefinition,
      match: "params",
      getId: p => String(p.id),
    });
    const params = { id: "one" };
    ctx.sidebar.registerItem({ id: "one", title: "一", page, params });
    ctx.sidebar.registerItem({ id: "two", title: "二", page, params: { id: "two" } });
    params.id = "changed";
    const items = composeNavSections(runtime.listSidebar()).find(s => s.id === "plugins")?.items;
    if (!items?.[0].plugin) throw new Error("缺少插件入口");
    await items[0].plugin.open();
    expect(
      isNavItemActive(items[0], {
        key: "plugin-page",
        params: { pluginId: "a", pageId: "page", instanceId: "one" },
      })
    ).toBe(true);
    expect(
      isNavItemActive(items[1], {
        key: "plugin-page",
        params: { pluginId: "a", pageId: "page", instanceId: "one" },
      })
    ).toBe(false);
    expect(isNavItemActive(items[0], { key: "home", params: {} })).toBe(false);
    expect(runtime.listSidebar().items[0].instanceId).toBe("one");
  });

  it("激活失败无贡献残留，恢复和重复启停不会累积入口", async () => {
    const runtime = makeRuntime();
    let fail = true;
    runtime.host.registerTrusted(
      definePlugin({
        id: "a",
        name: "A",
        version: "1",
        create: () => ({
          activate(ctx) {
            const page = ctx.pages.register(pageDefinition);
            const group = ctx.sidebar.registerGroup({ id: "group", title: "组" });
            ctx.sidebar.registerItem({ id: "item", title: "入口", group: group.id, page });
            if (fail) throw new Error("故障");
          },
        }),
      })
    );
    await expect(runtime.host.enable("a")).rejects.toThrow("故障");
    expect(runtime.listSidebar()).toEqual({ groups: [], items: [] });
    fail = false;
    for (let i = 0; i < 3; i++) {
      await runtime.host.enable("a");
      expect(runtime.listSidebar().items).toHaveLength(1);
      await runtime.host.disable("a");
      expect(runtime.listSidebar()).toEqual({ groups: [], items: [] });
    }
  });

  it("实际侧边栏点击打开页面、切页取消高亮、折叠仍可用、停用清理", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let runtime!: DesktopPluginRuntime;
    function App() {
      const { navigator, state } = usePage();
      runtime ??= new DesktopPluginRuntime({
        workspaceId: "ui",
        navigator,
        storage: createMemoryStorage(),
        plugins: [],
      });
      return (
        <PluginRuntimeContext.Provider value={runtime}>
          <Sidebar resizing={false} />
          <PageHost state={state} />
        </PluginRuntimeContext.Provider>
      );
    }
    try {
      useShellStore.setState({ sidebarCollapsed: false, navSectionCollapsed: {} });
      await act(async () =>
        root.render(
          <PageProvider initialKey="home">
            <App />
          </PageProvider>
        )
      );
      runtimes.push(runtime);
      await act(async () => {
        await activate(runtime, "ui", ctx => {
          const page = ctx.pages.register(pageDefinition);
          ctx.sidebar.registerItem({
            id: "entry",
            title: "插件入口",
            icon: ({ size, strokeWidth, ...props }: PluginSidebarIconProps) => (
              <svg
                data-testid="custom-icon"
                width={size}
                height={size}
                stroke="currentColor"
                strokeWidth={strokeWidth}
                {...props}
              >
                <path d="M12 3L4 20h16Z" />
              </svg>
            ),
            group: SIDEBAR_GROUPS.daily,
            page,
          });
        });
      });
      const button = () =>
        container.querySelector<HTMLButtonElement>('button[aria-label="插件入口"]');
      const clickEntry = () => {
        const entry = button();
        if (!entry) throw new Error("缺少插件按钮");
        entry.click();
      };
      expect(button()?.getAttribute("aria-current")).toBeNull();
      expect(button()?.querySelector('svg[data-testid="custom-icon"]')?.getAttribute("width")).toBe(
        "1.06em"
      );
      expect(button()?.querySelector("svg")?.getAttribute("stroke-width")).toBe("1.75");
      expect(button()?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      await act(async () => clickEntry());
      expect(container.textContent).toContain("插件正文");
      expect(button()?.getAttribute("aria-current")).toBe("page");
      await act(async () => {
        const home = container.querySelector<HTMLButtonElement>('button[aria-label="今日"]');
        if (!home) throw new Error("缺少首页按钮");
        home.click();
      });
      expect(button()?.getAttribute("aria-current")).toBeNull();
      await act(async () => useShellStore.getState().setSidebarCollapsed(true));
      expect(button()?.querySelector('svg[data-testid="custom-icon"]')).not.toBeNull();
      await act(async () => clickEntry());
      expect(button()?.getAttribute("aria-current")).toBe("page");
      await act(async () => runtime.host.disable("ui"));
      expect(button()).toBeNull();
    } finally {
      await act(async () => {
        await runtime?.dispose();
        root.unmount();
      });
      container.remove();
    }
  });
});
