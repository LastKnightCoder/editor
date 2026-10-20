import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  showInactive: vi.fn(),
}));
vi.mock("electron", () => ({
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } }),
  },
}));
vi.mock("electron-log", () => ({ default: { info: vi.fn() } }));
vi.mock("../../app-quit-controller", () => ({ isAppQuitting: () => false }));
vi.mock("../window-registry", () => ({ registerWindow: vi.fn() }));
vi.mock("../create-window", () => ({
  createWindow: () => ({
    webContents: { send: mocks.send },
    isDestroyed: () => false,
    isVisible: () => false,
    setAlwaysOnTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setBounds: vi.fn(),
    showInactive: mocks.showInactive,
    on: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

it("通知窗口尚未就绪时撤销单条，ready 不会复活它", async () => {
  const notifications = await import("../notification-window");
  notifications.pushSystemNotification({ id: "removed", title: "应撤销" });
  notifications.pushSystemNotification({ id: "kept", title: "应保留" });
  notifications.dismissSystemNotification("removed");
  mocks.send.mockClear();
  notifications.markNotificationWindowReady();
  expect(mocks.send.mock.calls).toEqual([
    ["notification-window:push", { id: "kept", title: "应保留" }],
  ]);
});

it("就绪前全部撤销，不推送卡片也不显示空窗口", async () => {
  const notifications = await import("../notification-window");
  notifications.pushSystemNotification({ id: "removed", title: "应撤销" });
  notifications.dismissSystemNotification();
  mocks.send.mockClear();
  notifications.markNotificationWindowReady();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.showInactive).not.toHaveBeenCalled();
});
