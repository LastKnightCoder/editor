import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return {
    default: create(() => ({ inited: false, setting: { database: { active: "data.db" } } })),
  };
});
vi.mock("@/stores/useGlobalStateStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ databaseStatus: {} })) };
});
vi.mock("@/commands", () => ({ connectDatabaseByName: vi.fn(), trackEvent: vi.fn() }));
vi.mock("@/page/PageProvider", () => ({
  PageProvider: () => <div>页面已就绪</div>,
  usePage: vi.fn(),
}));
vi.mock("@/page/PageHost", () => ({ PageHost: () => null }));
vi.mock("../PageNavigationBridge", () => ({ PageNavigationBridge: () => null }));
vi.mock("@tau/ui", () => ({
  Loading: ({ label }: { label: string }) => <div>{label}</div>,
  NotificationHost: () => null,
  ToastHost: () => null,
  initScrollbarAutoHide: () => vi.fn(),
}));
vi.mock("@/features/search/SearchPalette", () => ({ SearchPalette: () => null }));
vi.mock("@/features/settings/SettingsScreen", () => ({ SettingsScreen: () => null }));
vi.mock("@/features/search/searchStore", () => ({ useSearchStore: vi.fn() }));
vi.mock("@/features/search/searchMeta", () => ({ isReplayableVisit: vi.fn() }));
vi.mock("../useThemeRuntime", () => ({ useThemeRuntime: vi.fn() }));
vi.mock("../Sidebar", () => ({ Sidebar: () => null }));
vi.mock("../Titlebar", () => ({ Titlebar: () => null }));
vi.mock("../AssistDock", () => ({ AssistDock: () => null }));
// 通知产生端与跨窗口桥不属于启动流程的关注点，空挂避免拉入其依赖树
vi.mock("@/features/notifications/useNotificationBridge", () => ({
  useNotificationBridge: () => vi.fn(),
}));
vi.mock("@/components/JoinRequestNotifications", () => ({ default: () => null }));
vi.mock("@/components/AutoUpdateChecker", () => ({ default: () => null }));
vi.mock("@/pages", () => ({}));

import AppShell from "../AppShell";
import { connectDatabaseByName } from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import useGlobalStateStore from "@/stores/useGlobalStateStore";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  useSettingStore.setState(state => ({
    inited: false,
    setting: { ...state.setting, database: { ...state.setting.database, active: "data.db" } },
  }));
  useGlobalStateStore.setState({ databaseStatus: {} });
  vi.mocked(connectDatabaseByName).mockResolvedValue(undefined);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

it("缓存库名不变时等待设置就绪，再自动连接并进入页面", async () => {
  await act(async () => root.render(<AppShell />));
  expect(container.textContent).toContain("正在连接数据库");
  expect(container.textContent).not.toContain("数据库连接失败");
  expect(connectDatabaseByName).not.toHaveBeenCalled();

  await act(async () => {
    useSettingStore.setState({ inited: true });
  });
  expect(connectDatabaseByName).toHaveBeenCalledExactlyOnceWith("data.db");
  expect(container.textContent).toContain("页面已就绪");
  expect(useGlobalStateStore.getState().databaseStatus["data.db"]).toBe("ready");
});

it("设置已就绪时直接连接，真实连接失败仍显示错误并可重试", async () => {
  useSettingStore.setState({ inited: true });
  vi.mocked(connectDatabaseByName).mockRejectedValueOnce(new Error("开库失败"));
  await act(async () => root.render(<AppShell />));
  expect(container.textContent).toContain("开库失败");
  expect(useGlobalStateStore.getState().databaseStatus["data.db"]).toBe("error");
  await act(async () => {
    container.querySelector("button")?.click();
  });
  expect(container.textContent).toContain("页面已就绪");
  expect(connectDatabaseByName).toHaveBeenCalledTimes(2);
});

it("设置就绪后切换库仍重新连接新库", async () => {
  useSettingStore.setState({ inited: true });
  await act(async () => root.render(<AppShell />));
  await act(async () => {
    useSettingStore.setState(state => ({
      setting: { ...state.setting, database: { ...state.setting.database, active: "other.db" } },
    }));
  });
  expect(connectDatabaseByName).toHaveBeenNthCalledWith(2, "other.db");
  expect(container.textContent).toContain("页面已就绪");
  expect(useGlobalStateStore.getState().databaseStatus["other.db"]).toBe("ready");
});
