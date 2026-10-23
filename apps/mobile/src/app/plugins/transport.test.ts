import { transferableAbortController } from "node:util";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createPluginFetch, decodePluginBytes, encodePluginBytes } from "./transport";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
beforeEach(() => {
  const controller = transferableAbortController();
  vi.stubGlobal("AbortController", controller.constructor);
  vi.stubGlobal("AbortSignal", controller.signal.constructor);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("请求保留自定义方法、鉴权头和二进制，HTTP 失败仍返回标准 Response", async () => {
  vi.mocked(invoke).mockResolvedValue({
    status: 403,
    statusText: "Forbidden",
    headers: [["x-fixture", "ok"]],
    body: encodePluginBytes(new Uint8Array([0, 255, 3])),
    url: "https://example.com/dav",
  });
  const response = await createPluginFetch("session")("https://example.com/dav", {
    method: "PROPFIND",
    headers: { Authorization: "Basic fixture" },
    body: new Uint8Array([255, 1]),
  });
  expect(response.status).toBe(403);
  expect(response.ok).toBe(false);
  expect(response.headers.get("x-fixture")).toBe("ok");
  expect(response.url).toBe("https://example.com/dav");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 255, 3]));
  const payload = vi.mocked(invoke).mock.calls[0][1] as {
    request: { method: string; headers: string[][]; body: string };
  };
  expect(payload.request.method).toBe("PROPFIND");
  expect(payload.request.headers).toContainEqual(["authorization", "Basic fixture"]);
  expect(decodePluginBytes(payload.request.body)).toEqual(new Uint8Array([255, 1]));
});
it("取消立即结束等待并通知原生，迟到响应不交付", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_fetch"
      ? new Promise(resolve => {
          finish = resolve;
        })
      : undefined
  );
  const controller = new AbortController();
  const pending = createPluginFetch("session")("https://example.com", {
    signal: controller.signal,
  });
  await Promise.resolve();
  const assertion = expect(pending).rejects.toThrow();
  controller.abort();
  await assertion;
  expect(invoke).toHaveBeenCalledWith(
    "plugin_fetch_cancel",
    expect.objectContaining({ token: "session" })
  );
  finish({ status: 200, statusText: "OK", headers: [], body: "", url: "https://example.com" });
});
it("HEAD 和空响应状态不构造非法响应体", async () => {
  vi.mocked(invoke).mockResolvedValue({
    status: 204,
    statusText: "No Content",
    headers: [],
    body: "",
    url: "https://example.com",
  });
  const response = await createPluginFetch("session")("https://example.com", { method: "HEAD" });
  expect(response.body).toBeNull();
});

it("原生字符串错误转换为标准网络错误，不暴露 IPC 异常类型", async () => {
  vi.mocked(invoke).mockRejectedValue("网络连接失败");
  const pending = createPluginFetch("session")("https://example.com");
  await expect(pending).rejects.toBeInstanceOf(TypeError);
  await expect(pending).rejects.toThrow("网络连接失败");
});
