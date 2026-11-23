import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  reveal: vi.fn(),
  quitIfNoVisibleWindow: vi.fn(),
  quitting: false,
  remembered: false,
  remember: vi.fn(),
}));

vi.mock("electron", () => ({
  screen: {
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
}));
vi.mock("../create-window", () => ({
  createWindow: state.create,
  hideAuxiliaryWindow: (win: BrowserWindow) => win.hide(),
  revealWindow: state.reveal,
  quitIfNoVisibleWindow: state.quitIfNoVisibleWindow,
}));
vi.mock("../../app-quit-state", () => ({ isAppQuitting: () => state.quitting }));
vi.mock("../window-state", () => ({
  hasRememberedBounds: () => state.remembered,
  initialBounds: () => ({ x: 100, y: 100, width: 440, height: 640 }),
  rememberBounds: state.remember,
}));

import { findFeedbackWindow, hideFeedbackWindow, showFeedbackWindow } from "../utility-windows";

function fakeWindow() {
  let visible = false;
  let destroyed = false;
  const events = new EventEmitter();
  return Object.assign(events, {
    webContents: { send: vi.fn() },
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    setBounds: vi.fn(),
    show() {
      visible = true;
      events.emit("show");
    },
    hide: vi.fn(() => {
      visible = false;
    }),
    destroy() {
      destroyed = true;
      events.emit("closed");
    },
  });
}

beforeEach(() => {
  findFeedbackWindow()?.emit("closed");
  vi.clearAllMocks();
  state.quitting = false;
  state.remembered = false;
  state.create.mockImplementation(fakeWindow);
  state.reveal.mockImplementation(win => win.show());
});

it("首次打开创建窗口，关闭后再打开复用窗口", () => {
  const win = showFeedbackWindow(null);
  expect(state.create).toHaveBeenCalledWith(
    expect.objectContaining({
      route: "/feedback",
      show: false,
      devTools: false,
      role: "utility",
    })
  );
  expect(win.isVisible()).toBe(true);
  expect(showFeedbackWindow(null)).toBe(win);
  hideFeedbackWindow();
  expect(win.isVisible()).toBe(false);
  expect(state.quitIfNoVisibleWindow).toHaveBeenCalledOnce();
  expect(showFeedbackWindow(null)).toBe(win);
  expect(state.create).toHaveBeenCalledOnce();
});

it("关闭交给草稿确认，退出时不拦截，意外销毁后可重建", () => {
  const win = showFeedbackWindow(null);
  const event = { preventDefault: vi.fn() };
  win.emit("close", event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(win.webContents.send).toHaveBeenCalledWith("app-feedback:close-requested");
  state.quitting = true;
  event.preventDefault.mockClear();
  win.emit("close", event);
  expect(event.preventDefault).not.toHaveBeenCalled();
  win.destroy();
  expect(showFeedbackWindow(null)).not.toBe(win);
});

it("首次显示才按发起窗口定位，已有位置记忆时不覆盖", () => {
  const anchor = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 200, y: 100, width: 1000, height: 800 }),
  } as BrowserWindow;
  const win = showFeedbackWindow(anchor);
  expect(win.setBounds).toHaveBeenCalledWith({ x: 736, y: 156, width: 440, height: 640 });
  expect(state.remember).toHaveBeenCalledOnce();
  hideFeedbackWindow();
  state.remembered = true;
  vi.mocked(win.setBounds).mockClear();
  showFeedbackWindow(anchor);
  expect(win.setBounds).not.toHaveBeenCalled();
});
