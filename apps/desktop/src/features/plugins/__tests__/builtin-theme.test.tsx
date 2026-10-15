import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { APPEARANCE_STORAGE_KEY, THEME_STORAGE_KEY, listThemes } from "@tau/themes";
import { initThemeRuntime, useThemeStore } from "@tau/themes/react";
import { DesktopPluginProvider } from "@/app/plugins/PluginProvider";
import { useDesktopPlugins } from "@/app/plugins/context";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { PluginManagerView } from "../views/PluginManagerView";
import { pluginPaletteCommands } from "@/features/search/searchMeta";
import { useSettingsStore } from "@/app/settingsStore";
import { builtinPluginStateKey } from "@/app/plugins/builtin-manager";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "A" } } })) };
});
vi.mock("@/page/PageProvider", () => {
  const navigator = { push: vi.fn() };
  return { usePage: () => ({ navigator }) };
});
vi.mock("@/commands/plugin-development", () => ({
  openDevelopmentPlugins: vi.fn(),
  closeDevelopmentPlugins: vi.fn(),
}));
vi.mock("@/commands/fetch", () => ({ desktopFetch: vi.fn() }));
vi.mock("@/electron", () => ({ isElectron: true }));
import useSettingStore from "@/stores/useSettingStore";
import { openDevelopmentPlugins } from "@/commands/plugin-development";

let runtime: DesktopPluginRuntime | null;
let root: Root;
let container: HTMLDivElement;
let stopTheme: () => void;
function Capture() {
  const value = useDesktopPlugins();
  useEffect(() => {
    runtime = value;
  }, [value]);
  return <PluginManagerView />;
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
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(item => item.textContent === text);
  if (!button) throw new Error(`找不到按钮：${text}`);
  await act(async () => button.click());
}
async function mount() {
  root = createRoot(container);
  await act(async () =>
    root.render(
      <StrictMode>
        <DesktopPluginProvider>
          <Capture />
        </DesktopPluginProvider>
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
  localStorage.clear();
  runtime = null;
  useSettingStore.setState(state => ({
    setting: { ...state.setting, database: { ...state.setting.database, active: "A" } },
  }));
  useSettingsStore.getState().setSection("plugins");
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
  expect(getRuntime().host.listCommands()).toEqual([]);
  await click("启用");
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
  await click("停用");
  expect(pluginPaletteCommands(getRuntime().host)).toEqual([]);
  await expect(cycle()).rejects.toThrow("命令不可用");
  expect(useThemeStore.getState().theme).toBe(next);
  await click("启用");
  expect(pluginPaletteCommands(getRuntime().host)).toHaveLength(2);
  stopTheme();
  stopTheme = initThemeRuntime();
  expect(useThemeStore.getState().theme).toBe(next);
  expect(useThemeStore.getState().appearance).toBe("light");
});

it("切库回收旧实例并恢复启用，主动停用也在工作区间保持", async () => {
  await click("启用");
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
  await click("停用");
  await act(async () =>
    useSettingStore.setState(state => ({
      setting: { ...state.setting, database: { ...state.setting.database, active: "A" } },
    }))
  );
  expect(getRuntime().host.getState("core.theme")).toBe("disabled");
  expect(getRuntime().host.listCommands()).toEqual([]);
});

it("重建 Provider 从保存记录恢复启用，停用后再次重建仍停用", async () => {
  await click("启用");
  expect(localStorage.getItem(builtinPluginStateKey("core.theme"))).toBe("true");
  const previous = getRuntime();
  await remount();
  expect(previous.host.listCommands()).toEqual([]);
  expect(getRuntime().host.getState("core.theme")).toBe("active");
  expect(getRuntime().host.listCommands()).toHaveLength(2);
  await click("停用");
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
  await click("启用");
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
  await click("启用");
  expect(container.textContent).not.toContain("启用状态损坏");
  expect(getRuntime().host.getState("core.theme")).toBe("active");
  await remount();
  expect(getRuntime().host.getState("core.theme")).toBe("active");
});
