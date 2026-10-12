import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useNotificationBridge } from "../useNotificationBridge";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  runLocal: vi.fn(async () => {}),
  inAppAction: vi.fn(async () => {}),
  inAppClosed: vi.fn(async () => {}),
  listeners: {} as Record<string, (payload: unknown) => unknown>,
}));

vi.mock("@tau/ui", () => ({ notify: mocks.notify }));
vi.mock("../notify", () => ({ appNotify: vi.fn(), runLocal: mocks.runLocal }));
vi.mock("@/platform", () => ({
  platform: {
    notification: {
      inAppAction: mocks.inAppAction,
      inAppClosed: mocks.inAppClosed,
      onRunAction: (callback: (request: unknown) => unknown) => {
        mocks.listeners.runAction = callback;
        return () => delete mocks.listeners.runAction;
      },
      onInApp: (callback: (payload: unknown) => void) => {
        mocks.listeners.inApp = callback;
        return () => delete mocks.listeners.inApp;
      },
    },
  },
}));

let onItemsChange: ((ids: string[]) => void) | undefined;

const Harness = () => {
  onItemsChange = useNotificationBridge();
  return null;
};

describe("useNotificationBridge", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    onItemsChange = undefined;
    vi.clearAllMocks();
    mocks.listeners = {};
  });

  it("主进程直投 onInApp：入本地卡栈，按钮经 inAppAction 转回主进程执行", () => {
    act(() => {
      mocks.listeners.inApp({
        id: "main-1",
        title: "主进程通知",
        actions: [{ label: "处理" }],
      });
    });

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    const options = mocks.notify.mock.calls[0][0];
    expect(options).toMatchObject({ id: "main-1", title: "主进程通知" });
    expect(options.actions).toHaveLength(1);

    options.actions[0].onClick();
    expect(mocks.inAppAction).toHaveBeenCalledWith("main-1", 0);
  });

  it("系统窗口转发 onRunAction：交给 runLocal 执行本地登记的按钮", async () => {
    await mocks.listeners.runAction({ requestId: "req-1", id: "sys-1", index: 1 });
    expect(mocks.runLocal).toHaveBeenCalledWith("sys-1", 1);
  });

  it("onItemsChange：首次回报只记录；main origin 卡移除时回报 inAppClosed", () => {
    act(() => {
      mocks.listeners.inApp({ id: "main-2", title: "x" });
    });

    onItemsChange!(["main-2"]);
    expect(mocks.inAppClosed).not.toHaveBeenCalled();

    onItemsChange!([]);
    expect(mocks.inAppClosed).toHaveBeenCalledWith("main-2");
  });

  it("onItemsChange：非 main origin 的卡移除不回报", () => {
    onItemsChange!(["local-1"]);
    onItemsChange!([]);
    expect(mocks.inAppClosed).not.toHaveBeenCalled();
  });
});
