import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Header from "../Header";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("antd", () => ({
  App: {
    useApp: () => ({
      message: messageMock,
    }),
  },
}));

type MockWsClient = {
  isConnected: boolean;
  sendRequest: ReturnType<typeof vi.fn>;
};

describe("Header 稍后读反馈", () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    messageMock.success.mockReset();
    messageMock.info.mockReset();
    messageMock.warning.mockReset();
    messageMock.error.mockReset();
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi
          .fn()
          .mockResolvedValue([
            { title: "示例页面", url: "https://example.com/article" },
          ]),
      },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  const renderHeader = (wsClient: MockWsClient | null) => {
    act(() => {
      root.render(
        <Header
          onSettingsClick={() => undefined}
          onReloadClick={() => undefined}
          wsClient={wsClient as never}
        />,
      );
    });
  };

  const clickReadLater = async () => {
    const button = container.querySelector(
      'button[title="稍后读"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  it("保存成功后提示已加入稍后读", async () => {
    const wsClient = {
      isConnected: true,
      sendRequest: vi.fn().mockResolvedValue({ ok: true, id: 1 }),
    };

    renderHeader(wsClient);
    await clickReadLater();

    expect(wsClient.sendRequest).toHaveBeenCalledWith(
      "read-later:add-from-extension",
      {
        title: "示例页面",
        url: "https://example.com/article",
      },
    );
    expect(messageMock.success).toHaveBeenCalledWith("已加入稍后读");
  });

  it("重复保存时提示已存在", async () => {
    const wsClient = {
      isConnected: true,
      sendRequest: vi
        .fn()
        .mockResolvedValue({ ok: true, id: 1, duplicate: true }),
    };

    renderHeader(wsClient);
    await clickReadLater();

    expect(messageMock.info).toHaveBeenCalledWith("已在稍后读中");
  });

  it("保存失败时提示失败原因", async () => {
    const wsClient = {
      isConnected: true,
      sendRequest: vi.fn().mockRejectedValue(new Error("数据库未就绪")),
    };

    renderHeader(wsClient);
    await clickReadLater();

    expect(messageMock.error).toHaveBeenCalledWith("保存稍后读失败");
  });

  it("当前标签页没有 URL 时提示无法保存", async () => {
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([{ title: "无 URL 页面" }]),
      },
    });
    const wsClient = {
      isConnected: true,
      sendRequest: vi.fn(),
    };

    renderHeader(wsClient);
    await clickReadLater();

    expect(wsClient.sendRequest).not.toHaveBeenCalled();
    expect(messageMock.warning).toHaveBeenCalledWith("当前页面无法加入稍后读");
  });
});
