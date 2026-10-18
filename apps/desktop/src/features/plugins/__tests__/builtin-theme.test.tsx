import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { APPEARANCE_STORAGE_KEY, THEME_STORAGE_KEY, listThemes } from "@tau/themes";
import { initThemeRuntime, useThemeStore } from "@tau/themes/react";
import { DesktopPluginProvider } from "@/app/plugins/PluginProvider";
import { useDesktopPlugins } from "@/app/plugins/context";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PluginsView } from "../views/PluginsView";
import { pluginPaletteCommands } from "@/features/search/searchMeta";
import { builtinPluginStateKey } from "@/app/plugins/activation-manager";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "A" } } })) };
});
vi.mock("@/page/PageProvider", () => {
  const navigator = { push: vi.fn() };
  return { usePage: () => ({ navigator }), usePageParams: () => ({ tab: "installed" }) };
});
vi.mock("@/commands/plugin-development", () => ({
  openDevelopmentPlugins: vi.fn(),
  closeDevelopmentPlugins: vi.fn(),
}));
vi.mock("@/commands/fetch", () => ({ desktopFetch: vi.fn() }));
vi.mock("@/commands/plugin-local", () => ({
  getPluginWorkspace: vi.fn(async (name: string) => name),
  scanLocalPlugins: vi.fn(async () => ({ directory: "/test/.editor/plugins", entries: [] })),
  openPluginDirectory: vi.fn(),
  uninstallLocalPlugin: vi.fn(),
  setLocalPluginEnabled: vi.fn(async () => undefined),
  fetchPluginCatalog: vi.fn(async () => ({ items: [] })),
}));
vi.mock("@/electron", () => ({ isElectron: true, on: vi.fn(), off: vi.fn() }));
vi.mock("@/tools/pluginMCP", () => ({ registerPluginMCP: vi.fn() }));
vi.mock("@/commands/extra", () => ({ openExternal: vi.fn() }));
import useSettingStore from "@/stores/useSettingStore";
import { openDevelopmentPlugins } from "@/commands/plugin-development";
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
function commandAction(id: string) {
  const command = pluginPaletteCommands(getRuntime().host).find(item => item.id === id);
  if (!command?.run) throw new Error(`命令未注册：${id}`);
  return command.run;
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
}
beforeEach(async () => {
  vi.stubEnv("DEV", false);
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
  vi.clearAllMocks();
});

it("正式构建装配内置插件，管理启停与命令面板真实修改同一主题状态", async () => {
  expect(
    getRuntime()
      .host.listPlugins()
      .map(plugin => plugin.id)
  ).toEqual(["core.theme"]);
  expect(getRuntime().development).toBeUndefined();
  expect(openDevelopmentPlugins).not.toHaveBeenCalled();
  expect(getPluginWorkspace).toHaveBeenCalledWith("A");
  expect(scanLocalPlugins).toHaveBeenCalled();
  expect(container.textContent).not.toContain("选择开发插件目录");
  await menu("打开插件目录");
  expect(openPluginDirectory).toHaveBeenCalledOnce();
  const scans = vi.mocked(scanLocalPlugins).mock.calls.length;
  await menu("重新扫描");
  expect(vi.mocked(scanLocalPlugins).mock.calls.length).toBe(scans + 1);
  expect(getRuntime().host.listCommands()).toEqual([]);
  await setEnabled(true);
  const commands = pluginPaletteCommands(getRuntime().host);
  expect(commands).toHaveLength(2);
  const cycle = commandAction("plugin:core.theme:cycle-appearance");
  useThemeStore.getState().setAppearance("light");
  await act(async () => {
    await cycle();
  });
  expect(useThemeStore.getState().appearance).toBe("dark");
  expect(document.documentElement.dataset.mode).toBe("dark");
  expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
  await act(async () => {
    await cycle();
  });
  expect(useThemeStore.getState().appearance).toBe("system");
  await act(async () => {
    await cycle();
  });
  expect(useThemeStore.getState().appearance).toBe("light");
  const themes = listThemes();
  const index = themes.findIndex(theme => theme.key === useThemeStore.getState().theme);
  const next = themes[(index + 1) % themes.length].key;
  await act(async () => {
    await commandAction("plugin:core.theme:next-theme")();
  });
  expect(useThemeStore.getState().theme).toBe(next);
  expect(document.documentElement.dataset.theme).toBe(next);
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(next);
  await setEnabled(false);
  expect(pluginPaletteCommands(getRuntime().host)).toEqual([]);
  await expect(cycle()).rejects.toThrow("命令不可用");
  expect(useThemeStore.getState().theme).toBe(next);
  await setEnabled(true);
  expect(pluginPaletteCommands(getRuntime().host)).toHaveLength(2);
  stopTheme();
  stopTheme = initThemeRuntime();
  expect(useThemeStore.getState().theme).toBe(next);
  expect(useThemeStore.getState().appearance).toBe("light");
});

it("切库回收旧实例并恢复启用，主动停用也在工作区间保持", async () => {
  await setEnabled(true);
  const old = getRuntime();
  await act(async () => {
    await old.host.executeCommand("core.theme:next-theme");
  });
  const theme = useThemeStore.getState().theme;
  await act(async () =>
    useSettingStore.setState(state => ({
      setting: { ...state.setting, database: { ...state.setting.database, active: "B" } },
    }))
  );
  expect(runtime).not.toBe(old);
  expect(old.host.listCommands()).toEqual([]);
  expect(getRuntime().host.getState("core.theme")).toBe("active");
  expect(useThemeStore.getState().theme).toBe(theme);
  expect(getRuntime().host.listCommands()).toHaveLength(2);
  await setEnabled(false);
  await act(async () =>
    useSettingStore.setState(state => ({
      setting: { ...state.setting, database: { ...state.setting.database, active: "A" } },
    }))
  );
  expect(getRuntime().host.getState("core.theme")).toBe("disabled");
  expect(getRuntime().host.listCommands()).toEqual([]);
});

it("重建 Provider 从保存记录恢复启用，停用后再次重建仍停用", async () => {
  await setEnabled(true);
  expect(localStorage.getItem(builtinPluginStateKey("core.theme"))).toBe("true");
  const previous = getRuntime();
  await remount();
  expect(previous.host.listCommands()).toEqual([]);
  expect(getRuntime().host.getState("core.theme")).toBe("active");
  expect(getRuntime().host.listCommands()).toHaveLength(2);
  await setEnabled(false);
  expect(localStorage.getItem(builtinPluginStateKey("core.theme"))).toBe("false");
  await remount();
  expect(getRuntime().host.getState("core.theme")).toBe("disabled");
});

it("同源窗口的启停和清空偏好通知会同步到当前实例", async () => {
  const key = builtinPluginStateKey("core.theme");
  await act(async () => {
    localStorage.setItem(key, "true");
    window.dispatchEvent(
      new StorageEvent("storage", { key, newValue: "true", storageArea: localStorage })
    );
  });
  expect(getRuntime().host.getState("core.theme")).toBe("active");
  await act(async () => {
    localStorage.setItem(key, "false");
    window.dispatchEvent(
      new StorageEvent("storage", { key, newValue: "false", storageArea: localStorage })
    );
  });
  expect(getRuntime().host.getState("core.theme")).toBe("disabled");
  await setEnabled(true);
  await act(async () => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
  });
  expect(getRuntime().host.listCommands()).toEqual([]);
});

it("损坏记录在管理入口显示错误，用户启用后修复并可恢复", async () => {
  localStorage.setItem(builtinPluginStateKey("core.theme"), "broken");
  await remount();
  expect(container.textContent).toContain("启用状态损坏");
  expect(getRuntime().host.getState("core.theme")).toBe("disabled");
  await setEnabled(true);
  expect(container.textContent).not.toContain("启用状态损坏");
  expect(getRuntime().host.getState("core.theme")).toBe("active");
  await remount();
  expect(getRuntime().host.getState("core.theme")).toBe("active");
});

it("开发构建也只默认装配主题插件，不自动添加验证样本", async () => {
  vi.stubEnv("DEV", true);
  await remount();
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(
    getRuntime()
      .host.listPlugins()
      .map(plugin => plugin.id)
  ).toEqual(["core.theme"]);
  expect(openDevelopmentPlugins).not.toHaveBeenCalled();
  expect(scanLocalPlugins).toHaveBeenCalled();
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
