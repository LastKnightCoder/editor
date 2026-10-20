import { beforeEach, describe, expect, it, vi } from "vitest";

/** 通知路由规则单测：mock BrowserWindow / webContents，只验证裁决与推送去向 */

const state = vi.hoisted(() => ({
  allWindows: [] as Array<Record<string, unknown>>,
  webContentsById: new Map<number, Record<string, unknown>>(),
  push: vi.fn(),
  dismissPush: vi.fn(),
  focusMain: vi.fn(),
  reveal: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => state.allWindows,
    fromWebContents: (wc: Record<string, unknown>) => wc?.ownerWindow ?? null,
  },
  webContents: {
    fromId: (id: number) => state.webContentsById.get(id),
  },
}));
vi.mock("../notification-window", () => ({
  NOTIFICATION_WINDOW_KEY: "notification:system",
  pushSystemNotification: state.push,
  dismissSystemNotification: state.dismissPush,
}));
vi.mock("../create-window", () => ({ revealWindow: state.reveal }));
vi.mock("../main-window", () => ({ showOrCreateMainWindow: state.focusMain }));

import {
  routeNotification,
  runInAppNotificationAction,
  closeInAppNotification,
} from "../notification-router";

interface FakeWindowOptions {
  webContentsId: number;
  focused: boolean;
}

/** 最小可用的窗口 + webContents 对：ownerWindow 互指以走通 fromWebContents */
function fakeWindow({ webContentsId, focused }: FakeWindowOptions) {
  const send = vi.fn();
  let isFocused = focused;
  const webContents = {
    id: webContentsId,
    send,
    isDestroyed: () => false,
    ownerWindow: null,
  };
  const win = { webContents, isFocused: () => isFocused, isDestroyed: () => false };
  (webContents as Record<string, unknown>).ownerWindow = win;
  state.allWindows.push(win);
  state.webContentsById.set(webContentsId, webContents);
  return { win, webContents, send, setFocused: (value: boolean) => (isFocused = value) };
}

const payload = (id: string) => ({ id, title: "标题" });

beforeEach(() => {
  state.allWindows = [];
  state.webContentsById.clear();
  state.push.mockReset();
  state.dismissPush.mockReset();
  state.focusMain.mockReset();
  state.reveal.mockReset();
});

describe("routeNotification 裁决规则", () => {
  it("id 已在系统窗口 → 原位替换并返回 system（即使来源窗口此刻聚焦）", () => {
    const originWin = fakeWindow({ webContentsId: 1, focused: false });
    const origin = { kind: "window" as const, webContentsId: 1 };
    // 第一次路由时窗口失焦，通知落在系统窗口
    expect(routeNotification(payload("n1"), origin)).toBe("system");
    // 同 id 再路由：来源窗口已聚焦也应留在系统窗口（出生在哪就留在哪）
    originWin.setFocused(true);
    expect(routeNotification(payload("n1"), origin)).toBe("system");
    expect(state.push).toHaveBeenCalledTimes(2);
    expect(state.push.mock.calls[1][0]).toEqual(payload("n1"));
  });

  it("window origin 聚焦 → in-app，不向系统窗口推送", () => {
    fakeWindow({ webContentsId: 1, focused: true });
    const route = routeNotification(payload("n2"), { kind: "window", webContentsId: 1 });
    expect(route).toBe("in-app");
    expect(state.push).not.toHaveBeenCalled();
  });

  it("window origin 失焦 → system 并推送（贴该窗口所在显示器）", () => {
    const { win } = fakeWindow({ webContentsId: 1, focused: false });
    const route = routeNotification(payload("n3"), { kind: "window", webContentsId: 1 });
    expect(route).toBe("system");
    expect(state.push).toHaveBeenCalledTimes(1);
    expect(state.push).toHaveBeenCalledWith(payload("n3"), win);
  });

  it("force system：来源窗口聚焦也跳过焦点判断直发系统窗口（origin 仍记发送方）", () => {
    const { win } = fakeWindow({ webContentsId: 1, focused: true });
    const route = routeNotification(
      payload("f1"),
      { kind: "window", webContentsId: 1 },
      { force: "system" }
    );
    expect(route).toBe("system");
    expect(state.push).toHaveBeenCalledTimes(1);
    expect(state.push).toHaveBeenCalledWith(payload("f1"), win);
  });

  it("main origin 且有聚焦窗口 → in-app，直投该窗口并记住 handlers", async () => {
    const { send } = fakeWindow({ webContentsId: 1, focused: true });
    const handler = vi.fn(async () => undefined);
    const onClose = vi.fn();
    const route = routeNotification(payload("n4"), { kind: "main", handlers: [handler], onClose });
    expect(route).toBe("in-app");
    expect(send).toHaveBeenCalledWith("notification:in-app", payload("n4"));
    expect(state.push).not.toHaveBeenCalled();

    // in-app 作答回传：渲染端执行按钮时主进程跑 handler，关闭时收尾
    await runInAppNotificationAction("n4", 0);
    expect(handler).toHaveBeenCalledTimes(1);
    closeInAppNotification("n4");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("force in-app：来源窗口失焦仍由该窗口入栈", () => {
    fakeWindow({ webContentsId: 1, focused: false });
    expect(
      routeNotification(
        payload("forced-in-app"),
        { kind: "window", webContentsId: 1 },
        { force: "in-app" }
      )
    ).toBe("in-app");
    expect(state.push).not.toHaveBeenCalled();
  });

  it("全部窗口失焦（main origin）→ system 并推送", () => {
    fakeWindow({ webContentsId: 1, focused: false });
    fakeWindow({ webContentsId: 2, focused: false });
    const route = routeNotification(payload("n5"), { kind: "main" });
    expect(route).toBe("system");
    expect(state.push).toHaveBeenCalledTimes(1);
    expect(state.push).toHaveBeenCalledWith(payload("n5"), null);
  });

  it("window origin 对应窗口已销毁 → 按 system 处理（不抛错）", () => {
    const route = routeNotification(payload("n6"), { kind: "window", webContentsId: 99 });
    expect(route).toBe("system");
    expect(state.push).toHaveBeenCalledWith(payload("n6"), null);
  });
});
