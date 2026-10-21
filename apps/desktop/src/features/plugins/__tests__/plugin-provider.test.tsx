import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initThemeRuntime } from "@tau/themes/react";
import { DesktopPluginProvider } from "@/app/plugins/PluginProvider";
import { useDesktopPlugins } from "@/app/plugins/context";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PluginsView } from "../views/PluginsView";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "A" } } })) };
});
vi.mock("@/page/PageProvider", () => {
  const navigator = { push: vi.fn() };
  return { usePage: () => ({ navigator }), usePageParams: () => ({ tab: "installed" }) };
});
vi.mock("@/commands/fetch", () => ({ desktopFetch: vi.fn() }));
vi.mock("@/commands/plugin-local", () => ({
  getPluginWorkspace: vi.fn(async (name: string) => name),
  scanLocalPlugins: vi.fn(async () => ({ directory: "/test/.editor/plugins", entries: [] })),
  openPluginDirectory: vi.fn(),
  uninstallLocalPlugin: vi.fn(),
  setLocalPluginEnabled: vi.fn(async () => undefined),
  fetchPluginCatalog: vi.fn(async () => ({ items: [] })),
}));
vi.mock("@/electron", () => ({
  isElectron: true,
  platform: "darwin",
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}));
vi.mock("@/tools/pluginMCP", () => ({ registerPluginMCP: vi.fn() }));
vi.mock("@/commands/extra", () => ({ openExternal: vi.fn() }));
import useSettingStore from "@/stores/useSettingStore";
import {
  getPluginWorkspace,
  scanLocalPlugins,
  openPluginDirectory,
  setLocalPluginEnabled,
} from "@/commands/plugin-local";

let runtime: DesktopPluginRuntime | null;
let root: Root;
let container: HTMLDivElement;
let stopTheme: () => void;
function Capture() {
  const value = useDesktopPlugins();
  useEffect(() => {
    runtime = value;
  }, [value]);
  return <PluginsView />;
}
function getRuntime() {
  if (!runtime) throw new Error("插件宿主未就绪");
  return runtime;
}
async function setEnabled(enabled: boolean, name = "主题切换") {
  const label = `${enabled ? "启用" : "停用"} ${name}`;
  const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!button) throw new Error(`找不到开关：${label}`);
  await act(async () => {
    button.click();
    await vi.dynamicImportSettled();
  });
}
async function menu(text: string) {
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="更多插件操作"]');
  if (!trigger) throw new Error("找不到更多操作");
  await act(async () => trigger.click());
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    element => element.textContent === text
  );
  if (!item) throw new Error(`找不到菜单项：${text}`);
  await act(async () => item.click());
}
async function mount() {
  root = createRoot(container);
  await act(async () =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={new QueryClient()}>
          <DesktopPluginProvider>
            <Capture />
          </DesktopPluginProvider>
        </QueryClientProvider>
      </StrictMode>
    )
  );
}
async function remount() {
  await act(async () => root.unmount());
  runtime = null;
  await mount();
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}
beforeEach(async () => {
  vi.stubEnv("DEV", false);
  vi.stubGlobal("electron", { invoke: vi.fn(async () => undefined) });
  vi.mocked(setLocalPluginEnabled).mockImplementation(async (id, enabled) => {
    const snapshot = await scanLocalPlugins();
    const entry = snapshot.entries.find(item => item.id === id);
    if (entry) entry.enabled = enabled;
  });
  vi.mocked(scanLocalPlugins).mockResolvedValue({
    directory: "/test/.editor/plugins",
    entries: [],
  });
  localStorage.clear();
  runtime = null;
  useSettingStore.setState(state => ({
    setting: { ...state.setting, database: { ...state.setting.database, active: "A" } },
  }));
  stopTheme = initThemeRuntime();
  container = document.createElement("div");
  document.body.append(container);
  await mount();
});
afterEach(async () => {
  await act(async () => root.unmount());
  stopTheme();
  container.remove();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([false, true])("DEV=%s时不自动装配任何插件，正式入口只从中心安装", async dev => {
  vi.stubEnv("DEV", dev);
  await remount();
  expect(getRuntime().host.listPlugins()).toEqual([]);
  expect(getRuntime().host.listCommands()).toEqual([]);
  expect(scanLocalPlugins).toHaveBeenCalled();
  expect(getPluginWorkspace).toHaveBeenCalledWith("A");
  await menu("打开插件目录");
  expect(openPluginDirectory).toHaveBeenCalled();
});

it("正式 Provider 启动发现本地包，管理启用后重建恢复，刷新移除缺失目录", async () => {
  vi.mocked(scanLocalPlugins).mockResolvedValue({
    directory: "/test/.editor/plugins",
    entries: [
      {
        id: "test.local",
        enabled: false,
        directory: "/test/.editor/plugins/test.local",
        artifact: {
          manifest: {
            formatVersion: 1,
            apiVersion: 1,
            platform: "desktop",
            format: "cjs",
            id: "test.local",
            name: "本地插件",
            version: "1.0.0",
            main: "main.js",
            integrity: { "main.js": "a".repeat(64) },
          },
          code: "module.exports.default=require('@tau/plugins').definePlugin({id:'test.local',name:'本地插件',version:'1.0.0',create:()=>({activate(ctx){ctx.commands.register({id:'run',title:'本地执行',run:()=>42});}})});",
        },
      },
    ],
  });
  await remount();
  expect(getRuntime().host.getState("test.local")).toBe("disabled");
  expect(getRuntime().host.listCommands()).toEqual([]);
  await setEnabled(true, "本地插件");
  expect(await getRuntime().host.executeCommand("test.local:run")).toBe(42);
  await remount();
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(getRuntime().host.getState("test.local")).toBe("active");
  vi.mocked(scanLocalPlugins).mockResolvedValue({
    directory: "/test/.editor/plugins",
    entries: [],
  });
  await menu("重新扫描");
  expect(
    getRuntime()
      .host.listPlugins()
      .some(plugin => plugin.id === "test.local")
  ).toBe(false);
  expect(getRuntime().host.listCommands()).toEqual([]);
});
