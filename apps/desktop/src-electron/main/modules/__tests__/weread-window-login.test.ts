import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  sendHeadersListener: null as
    | ((details: Electron.OnSendHeadersListenerDetails) => void)
    | null,
  completedListener: null as
    | ((details: Electron.OnCompletedListenerDetails) => void)
    | null,
  currentWindow: null as any,
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      mockState.handlers.set(channel, handler);
    }),
  },
  BrowserWindow: vi.fn().mockImplementation(() => {
    const windowListeners = new Map<string, (...args: any[]) => void>();
    const webContentsListeners = new Map<string, (...args: any[]) => void>();
    let destroyed = false;

    const webContents = {
      session: {
        webRequest: {
          onCompleted: vi.fn(
            (
              _filter: unknown,
              listener:
                | ((details: Electron.OnCompletedListenerDetails) => void)
                | null,
            ) => {
              mockState.completedListener = listener;
            },
          ),
          onSendHeaders: vi.fn(
            (
              _filter: unknown,
              listener:
                | ((details: Electron.OnSendHeadersListenerDetails) => void)
                | null,
            ) => {
              mockState.sendHeadersListener = listener;
            },
          ),
        },
        cookies: {
          get: vi.fn().mockResolvedValue([]),
        },
      },
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        webContentsListeners.set(event, listener);
      }),
      removeListener: vi.fn(
        (event: string, listener: (...args: any[]) => void) => {
          if (destroyed) {
            throw new TypeError("Object has been destroyed");
          }
          const current = webContentsListeners.get(event);
          if (current === listener) {
            webContentsListeners.delete(event);
          }
        },
      ),
      reload: vi.fn(),
      isDestroyed: vi.fn(() => destroyed),
    };

    const window = {
      webContents,
      loadURL: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(() => {
        destroyed = true;
        windowListeners.get("closed")?.();
      }),
      isDestroyed: vi.fn(() => destroyed),
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        windowListeners.set(event, listener);
      }),
    };

    mockState.currentWindow = window;
    return window;
  }),
}));

vi.mock("electron-log", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../database", () => ({
  default: {
    getCurrentDatabase: vi.fn(),
  },
}));

vi.mock("../tables/weread-notebook", () => ({
  default: {},
}));

vi.mock("../tables/weread-view", () => ({
  default: {},
}));

vi.mock("../tables/weread-config", () => ({
  default: {},
}));

describe("weread login window lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.handlers.clear();
    mockState.sendHeadersListener = null;
    mockState.completedListener = null;
    mockState.currentWindow = null;
  });

  it("扫码登录成功后关闭窗口，不应再次访问已销毁的 webContents", async () => {
    const wereadModule = (await import("../weread")).default;

    await wereadModule.init();

    const loginHandler = mockState.handlers.get("weread:login-with-qr");
    expect(loginHandler).toBeTypeOf("function");

    const loginPromise = loginHandler?.();

    expect(mockState.sendHeadersListener).toBeTypeOf("function");

    mockState.sendHeadersListener?.({
      requestHeaders: {
        Cookie: "wr_name=%E6%B5%8B%E8%AF%95%E7%94%A8%E6%88%B7; wr_vid=vid-1",
      },
    } as Electron.OnSendHeadersListenerDetails);

    await expect(loginPromise).resolves.toEqual({
      cookies: [
        { name: "wr_name", value: "测试用户" },
        { name: "wr_vid", value: "vid-1" },
      ],
      userName: "测试用户",
      userVid: "vid-1",
    });
  });
});
