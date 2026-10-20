import { act, StrictMode, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageProvider, usePage, type Navigator } from "@/page/PageProvider";
import { PageHost } from "@/page/PageHost";
import { definePage } from "@/page/definePage";
import { DesktopPluginProvider } from "@/app/plugins/PluginProvider";
import { useDesktopPlugins } from "@/app/plugins/context";
import { DesktopPluginRuntime, PLUGIN_WORKBENCH_KEY } from "@/app/plugins/runtime";
import { pluginPaletteCommands } from "@/features/search/searchMeta";
import type { StackMachineState } from "@/page/core/stackMachine";
import { definePlugin, type PluginPageHandle } from "@tau/plugins";
import "../pages/plugin-page.page";
import "../pages/plugin-workbench.page";
import "../pages/plugins.page";
import "../pages/plugin-detail.page";
import { notesPlugin } from "./fixtures/example/notesPlugin";
import { settingsPlugin } from "./fixtures/example/settingsPlugin";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "A" } } })) };
});
vi.mock("@/commands/plugin-local", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands/plugin-local")>()),
  fetchPluginCatalog: vi.fn(async () => ({ items: [] })),
}));
import useSettingStore from "@/stores/useSettingStore";
import { readPluginPageContext } from "@/services/plugin-page-context";

definePage({ key: "home", label: "今日", params: {}, component: () => <div>宿主首页</div> });
const pluginId = "example.desktop-pages";
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let runtime: DesktopPluginRuntime | null;
let navigator: Navigator;
let state: StackMachineState;

function Capture() {
  const value = usePage();
  const plugins = useDesktopPlugins();
  useEffect(() => {
    if (plugins && !plugins.host.listPlugins().some(plugin => plugin.id === notesPlugin.id))
      plugins.host.registerTrusted(notesPlugin);
    runtime = plugins;
    navigator = value.navigator;
    state = value.state;
  }, [plugins, value]);
  return <PageHost state={value.state} />;
}

function App() {
  const workspaceId = useSettingStore(s => s.setting.database.active);
  return (
    <DndProvider backend={HTML5Backend}>
      <PageProvider key={workspaceId} initialKey={PLUGIN_WORKBENCH_KEY}>
        <DesktopPluginProvider>
          <Capture />
        </DesktopPluginProvider>
      </PageProvider>
    </DndProvider>
  );
}

function currentRuntime() {
  if (!runtime) throw new Error("插件运行时尚未就绪");
  return runtime;
}

function setWorkspace(active: string) {
  useSettingStore.setState(value => ({
    setting: { ...value.setting, database: { ...value.setting.database, active } },
  }));
}

function activePage() {
  return container.querySelector('[data-page-active=""]') ?? container;
}

async function click(text: string) {
  const button = [...activePage().querySelectorAll("button")].find(
    item => item.textContent === text
  );
  if (!button) throw new Error(`找不到按钮：${text}`);
  await act(async () => button.click());
  await settle();
}

async function settle() {
  await act(async () => {
    await vi.dynamicImportSettled();
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}

beforeEach(async () => {
  window.localStorage.clear();
  runtime = null;
  setWorkspace("A");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  await act(async () =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <App />
        </QueryClientProvider>
      </StrictMode>
    )
  );
  await settle();
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});

describe("桌面插件完整路径", () => {
  it("页面上下文在 StrictMode 下读取最新实例状态，切页恢复并随停用和切库清理", async () => {
    let page!: PluginPageHandle;
    await act(async () => {
      currentRuntime().host.registerTrusted(
        definePlugin({
          id: "context-sample",
          name: "上下文样本",
          version: "1",
          create: () => ({
            activate(context) {
              page = context.pages.register({
                id: "detail",
                title: "状态页",
                match: "params",
                getId: params => String(params.id),
                component: function StatePage({ pageContext, params }) {
                  const [count, setCount] = useState(0);
                  useEffect(() => {
                    const registration = pageContext.register(() => [params.id, count]);
                    return () => {
                      registration.dispose();
                    };
                  }, [pageContext, params.id, count]);
                  return <button onClick={() => setCount(value => value + 1)}>增加</button>;
                },
              });
            },
          }),
        })
      );
    });
    await act(async () => currentRuntime().host.enable("context-sample"));
    await act(async () => page.open({ id: "A" }));
    const first = state.back.at(-1);
    if (!first) throw new Error("缺少首个页面实例");
    expect(readPluginPageContext(first.params)).toEqual(["A", 0]);
    await click("增加");
    expect(readPluginPageContext(first.params)).toEqual(["A", 1]);
    await act(async () => page.open({ id: "B" }));
    const second = state.back.at(-1);
    if (!second) throw new Error("缺少第二个页面实例");
    expect(readPluginPageContext(second.params)).toEqual(["B", 0]);
    expect(readPluginPageContext(first.params)).toBeNull();
    await act(async () => navigator.back());
    expect(readPluginPageContext(first.params)).toEqual(["A", 1]);
    await act(async () => page.open({ id: "A", mode: "changed" }));
    expect(readPluginPageContext(first.params)).toBeNull();
    const updated = state.back.at(-1);
    if (!updated) throw new Error("缺少更新后的页面实例");
    expect(readPluginPageContext(updated.params)).toEqual(["A", 1]);
    await act(async () => currentRuntime().host.disable("context-sample"));
    expect(readPluginPageContext(updated.params)).toBeNull();
    await act(async () => currentRuntime().host.enable("context-sample"));
    await settle();
    expect(readPluginPageContext(updated.params)).toEqual(["A", 0]);
    await act(async () => setWorkspace("B"));
    await settle();
    expect(readPluginPageContext(updated.params)).toBeNull();
  });

  it("开发台将启停入口交给插件页", async () => {
    expect(
      [...activePage().querySelectorAll("button")].some(button => button.textContent === "启用")
    ).toBe(false);
    await click("打开插件管理");
    expect(state.back.at(-1)).toMatchObject({ key: "plugins", params: { tab: "installed" } });
    expect(activePage().querySelector(`[aria-label="启用 ${notesPlugin.name}"]`)).not.toBeNull();
  });
  it("显式注入设置夹具，命令打开插件详情的设置标签并随停用撤销", async () => {
    currentRuntime().host.registerTrusted(settingsPlugin);
    const host = currentRuntime().host;
    expect(host.getState("example.settings")).toBe("disabled");
    await act(async () => host.enable("example.settings"));
    const command = pluginPaletteCommands(host).find(item => item.label === "打开插件设置示例");
    expect(command).toMatchObject({ section: "插件", sub: "来自「自定义设置示例」" });
    await act(async () => command?.run?.());
    await settle();
    expect(state.back.at(-1)).toMatchObject({
      key: "plugin-detail",
      params: {
        pluginId: "example.settings",
        tab: "settings",
        section: "plugin:example.settings:reading",
      },
    });
    expect(activePage().querySelector('[role="switch"][aria-label]')).not.toBeNull();
    expect(activePage().textContent).toContain("阅读偏好（示例）");
    await act(async () => host.disable("example.settings"));
    expect(currentRuntime().listSettings()).toEqual([]);
    expect(pluginPaletteCommands(host)).toEqual([]);
    expect(activePage().textContent).toContain("插件设置暂不可用");
  });

  it("停用保活页面，后退不复活旧组件，重启用不重复命令", async () => {
    await act(async () => currentRuntime().host.enable(pluginId));
    await click("打开插件页面示例");
    await act(async () => navigator.push(PLUGIN_WORKBENCH_KEY));
    await act(async () => currentRuntime().host.disable(pluginId));
    await act(async () => navigator.back());
    expect(activePage().textContent).toContain("插件页面暂不可用");
    await act(async () => currentRuntime().host.enable(pluginId));
    await settle();
    expect(activePage().textContent).toContain("插件页面示例");
    expect(pluginPaletteCommands(currentRuntime().host)).toHaveLength(1);
  });

  it("页面渲染失败后停用再启用可恢复，不残留旧错误边界", async () => {
    let fail = true;
    let page!: PluginPageHandle;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      currentRuntime().host.registerTrusted(
        definePlugin({
          id: "broken",
          name: "故障样本",
          version: "1",
          create: () => ({
            activate(context) {
              page = context.pages.register({
                id: "page",
                title: "故障页",
                component: () => {
                  if (fail) throw new Error("渲染失败");
                  return <div>页面已恢复</div>;
                },
              });
            },
          }),
        })
      );
      await act(async () => currentRuntime().host.enable("broken"));
      await act(async () => page.open());
      expect(activePage().textContent).toContain("插件页面渲染失败");
      await act(async () => currentRuntime().host.disable("broken"));
      expect(activePage().textContent).toContain("插件页面暂不可用");
      fail = false;
      await act(async () => currentRuntime().host.enable("broken"));
      expect(activePage().textContent).toContain("页面已恢复");
    } finally {
      errors.mockRestore();
    }
  });

  it("宿主启用后从真实命令源打开，页面按参数去重并沿用后退前进", async () => {
    expect(pluginPaletteCommands(currentRuntime().host)).toEqual([]);
    await act(async () => currentRuntime().host.enable(pluginId));
    const [command] = pluginPaletteCommands(currentRuntime().host);
    expect(command.label).toBe("打开插件页面示例");
    await act(async () => {
      await command.run?.();
    });
    await settle();
    expect(activePage().textContent).toContain("插件页面示例");
    await click("打开条目 A");
    expect(activePage().textContent).toContain("条目 A");
    const firstId = state.back.at(-1)?.id;
    await act(async () => navigator.back());
    await click("打开条目 A");
    expect(state.back.at(-1)?.id).toBe(firstId);
    await act(async () => navigator.back());
    await click("打开条目 B");
    expect(state.back.at(-1)?.id).not.toBe(firstId);
    await act(async () => navigator.back());
    expect(activePage().textContent).toContain("插件页面示例");
    await act(async () => navigator.forward());
    expect(activePage().textContent).toContain("条目 B");
  });

  it("偏好落盘，停用移除页面与浮层，再启用恢复当前页面", async () => {
    await act(async () => currentRuntime().host.enable(pluginId));
    await click("打开插件页面示例");
    const toggle = activePage().querySelector<HTMLButtonElement>('[role="switch"]');
    if (!toggle) throw new Error("缺少偏好开关");
    expect(toggle.disabled).toBe(false);
    await act(async () => toggle.click());
    await settle();
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await click("查看说明");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => currentRuntime().host.disable(pluginId));
    expect(activePage().textContent).toContain("插件页面暂不可用");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(pluginPaletteCommands(currentRuntime().host)).toEqual([]);
    await act(async () => currentRuntime().host.enable(pluginId));
    await settle();
    expect(activePage().querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe(
      "true"
    );
  });

  it("切库等待旧宿主有界回收，不能在新工作区重新启用清理挂起的插件", async () => {
    const failed = definePlugin({
      id: "example.hanging-workspace",
      name: "切库挂起样本",
      version: "1.0.0",
      create: () => ({ activate: () => undefined, deactivate: () => new Promise(() => undefined) }),
    });
    const previous = currentRuntime();
    await act(async () => {
      previous.host.registerTrusted(failed);
      await previous.host.enable(failed.id);
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.useFakeTimers();
    try {
      await act(async () => setWorkspace("B"));
      await act(async () => vi.dynamicImportSettled());
      expect(activePage().textContent).toContain("正在准备插件开发台");
      await act(async () => vi.advanceTimersByTimeAsync(5_000));
    } finally {
      vi.useRealTimers();
      error.mockRestore();
    }
    await settle();
    const next = currentRuntime();
    expect(next).not.toBe(previous);
    await act(async () => next.host.registerTrusted(failed));
    expect(next.host.getState(failed.id)).toBe("restart-required");
    await expect(next.host.enable(failed.id)).rejects.toThrow("重启应用");
    await act(async () => next.host.enable(pluginId));
    expect(next.host.getState(pluginId)).toBe("active");
  });

  it("切库销毁旧宿主，新库偏好独立，返回原库仍可读取", async () => {
    await act(async () => currentRuntime().host.enable(pluginId));
    await click("打开插件页面示例");
    const oldRuntime = currentRuntime();
    const oldContext = oldRuntime.getPage(pluginId, "overview")?.context;
    if (!oldContext) throw new Error("缺少页面上下文");
    await oldContext.storage.set("compact", true);
    await act(async () => setWorkspace("B"));
    await settle();
    expect(oldContext.signal.aborted).toBe(true);
    await expect(oldContext.storage.set("compact", false)).rejects.toThrow();
    expect(oldRuntime.host.listCommands()).toEqual([]);
    await act(async () => currentRuntime().host.enable(pluginId));
    await click("打开插件页面示例");
    expect(activePage().querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe(
      "false"
    );
    await act(async () => setWorkspace("A"));
    await settle();
    await act(async () => currentRuntime().host.enable(pluginId));
    await click("打开插件页面示例");
    expect(activePage().querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe(
      "true"
    );
  });
});
