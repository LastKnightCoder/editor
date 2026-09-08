import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpInvoke, httpSend } from "../http-invoke";

vi.mock("../config", () => ({
  getRpcConfig: vi.fn(() =>
    Promise.resolve({
      baseUrl: "http://127.0.0.1:24678",
      token: "test-token",
      windowId: 3,
    })
  ),
}));

function okResponse(data: unknown) {
  return { ok: true as const, data };
}

function errorResponse(code: string, message = "boom", extra: Record<string, unknown> = {}) {
  return {
    ok: false as const,
    error: { code, message, name: "Error", ...extra },
  };
}

function jsonResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status < 400,
    status,
    text: async () => text,
    json: async () => body,
  };
}

function gatewayResponse(status = 502, text = "Bad Gateway") {
  return { ok: false, status, text: async () => text };
}

describe("httpInvoke", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("成功调用：透传鉴权头与序列化参数，反序列化返回值，携带超时 signal", async () => {
    fetchMock.mockResolvedValue(jsonResponse(okResponse({ count: { $__t: "bigint", v: "42" } })));

    const result = await httpInvoke("some-channel", [{ a: 1 }]);

    expect(result).toEqual({ count: 42n });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:24678/rpc/invoke");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      channel: "some-channel",
      args: [{ a: 1 }],
      windowId: 3,
    });
  });

  it("业务失败：不重试，抛出携带 name/channel/stack 的错误", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(errorResponse("HANDLER", "disk full", { channel: "write-file" }))
    );

    await expect(httpInvoke("write-file", [])).rejects.toMatchObject({
      message: "disk full",
      name: "Error",
      channel: "write-file",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("NO_HANDLER：未就绪时有限重试后成功（网络层失败会重置就绪标记）", async () => {
    fetchMock
      // 先以网络失败重置就绪标记，模拟服务重启后重新进入启动竞态窗口
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(errorResponse("NO_HANDLER")))
      .mockResolvedValueOnce(jsonResponse(okResponse("ready")));

    const result = await httpInvoke("lazy-channel", []);

    expect(result).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("就绪后 NO_HANDLER：立即失败不重试（channel 拼写错误快速暴露）", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(okResponse("primed")))
      .mockResolvedValueOnce(jsonResponse(errorResponse("NO_HANDLER")));

    // 第一次成功调用标记就绪，随后的 NO_HANDLER 不再进入重试等待
    await expect(httpInvoke("prime-channel", [])).resolves.toBe("primed");
    await expect(httpInvoke("typo-channel", [])).rejects.toMatchObject({
      code: "NO_HANDLER",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("网络层失败（TypeError）：重试后成功", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(okResponse(null)));

    await expect(httpInvoke("any", [])).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("响应为非协议内容（网关错误页）：按服务暂不可用重试", async () => {
    fetchMock
      .mockResolvedValueOnce(gatewayResponse(502))
      .mockResolvedValueOnce(jsonResponse(okResponse("recovered")));

    await expect(httpInvoke("any", [])).resolves.toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("非网络层异常：立即抛出不重试", async () => {
    fetchMock.mockRejectedValue(new SyntaxError("Unexpected token in JSON"));

    await expect(httpInvoke("any", [])).rejects.toThrow(SyntaxError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("httpSend", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("成功路径：fire-and-forget，不抛出", async () => {
    fetchMock.mockResolvedValue(jsonResponse(okResponse(null), 202));

    await expect(httpSend("notify-channel", [1])).resolves.toBeUndefined();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:24678/rpc/send");
  });

  it("返回错误体（如就绪后的 NO_HANDLER）：记录错误不抛出", async () => {
    fetchMock.mockResolvedValue(jsonResponse(errorResponse("NO_HANDLER"), 404));

    await expect(httpSend("missing-channel", [])).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("重试超时后仍失败：仅记录错误不抛出", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValue(new TypeError("connection refused"));

      const sendPromise = httpSend("notify-channel", []);
      await vi.advanceTimersByTimeAsync(6000);
      await expect(sendPromise).resolves.toBeUndefined();

      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
