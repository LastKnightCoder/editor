// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FETCH_CHUNK_BYTES } from "@tau/plugins/fetch-bridge";
import {
  createPluginFetch,
  decodePluginBytes,
  encodePluginBytes,
  readProviderFile,
  writeProviderFile,
  connectMobilePluginTransport,
} from "./transport";
import type { MobilePluginRuntime } from "./runtime";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
});
const metadata = {
  status: 403,
  statusText: "Forbidden",
  headers: [["x-fixture", "ok"]],
  url: "https://example.com/dav",
  redirected: false,
  type: "default",
  hasBody: true,
};

it("请求保留方法、鉴权和字节，HTTP 失败返回 Response；arrayBuffer 按文件句柄读取", async () => {
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "plugin_fetch_open") return 1;
    if (command === "plugin_fetch_upload") return true;
    if (command === "plugin_fetch_response") return metadata;
    if (command === "plugin_fetch_buffer") return { id: "spool", size: 3 };
    if (command === "plugin_file_read")
      return (args as { offset: number }).offset === 0
        ? encodePluginBytes(new Uint8Array([0, 255, 3]))
        : null;
  });
  const response = await createPluginFetch("session")("https://example.com/dav", {
    method: "PROPFIND",
    headers: { Authorization: "Basic fixture" },
    body: new Uint8Array([255, 1]),
  });
  expect(response.status).toBe(403);
  expect(response.ok).toBe(false);
  expect(response.url).toBe(metadata.url);
  expect(response.headers.get("x-fixture")).toBe("ok");
  expect(() => response.headers.set("x", "1")).toThrow();
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 255, 3]));
  expect(response.bodyUsed).toBe(true);
  await expect(response.arrayBuffer()).rejects.toThrow(TypeError);
  const request = vi
    .mocked(invoke)
    .mock.calls.find(([command]) => command === "plugin_fetch_open")![1] as {
    request: { method: string; headers: string[][]; body?: unknown; bufferedBody?: unknown };
  };
  expect(request.request.method).toBe("PROPFIND");
  expect(request.request.headers).toContainEqual(["authorization", "Basic fixture"]);
  expect(request.request.body).toBeUndefined();
  expect(request.request.bufferedBody).toBeUndefined();
  const chunk = vi
    .mocked(invoke)
    .mock.calls.find(
      ([command, args]) => command === "plugin_fetch_upload" && (args as { chunk?: string }).chunk
    )![1] as { chunk: string };
  expect(decodePluginBytes(chunk.chunk)).toEqual(new Uint8Array([255, 1]));
});
it("响应头先到达，未消费响应体时不读取；每次读取只拉下一块", async () => {
  let reads = 0;
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "plugin_fetch_open") return 2;
    if (command === "plugin_fetch_response") return { ...metadata, status: 200 };
    if (command === "plugin_fetch_read")
      return ++reads === 1 ? encodePluginBytes(new Uint8Array([1])) : null;
  });
  const response = await createPluginFetch("session")("https://example.com/dav");
  expect(reads).toBe(0);
  const reader = response.body!.getReader();
  expect((await reader.read()).value).toEqual(new Uint8Array([1]));
  expect(reads).toBe(1);
  expect((await reader.read()).done).toBe(true);
  expect(invoke).toHaveBeenCalledWith("plugin_fetch_read", { token: "session", id: 2 });
});
it("收到响应头后取消仍使响应体失败并回收原生请求", async () => {
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_fetch_open" ? 3 : command === "plugin_fetch_response" ? metadata : undefined
  );
  const controller = new AbortController();
  const response = await createPluginFetch("session")("https://example.com", {
    signal: controller.signal,
  });
  controller.abort("caller-stop");
  await expect(response.text()).rejects.toBe("caller-stop");
  expect(invoke).toHaveBeenCalledWith("plugin_fetch_cancel", { token: "session", id: 3 });
});
it("等待响应头时取消立即退出，无需等待原生返回", async () => {
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_fetch_open"
      ? 4
      : command === "plugin_fetch_response"
        ? new Promise(() => {})
        : undefined
  );
  const controller = new AbortController();
  const pending = createPluginFetch("session")("https://example.com", {
    signal: controller.signal,
  });
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("plugin_fetch_response", expect.anything())
  );
  controller.abort("cancel-wait");
  await expect(pending).rejects.toBe("cancel-wait");
});
it("HEAD 和空状态保持空响应体，原生字符串错误转换为 TypeError", async () => {
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_fetch_open" ? 5 : { ...metadata, hasBody: false, status: 204 }
  );
  const response = await createPluginFetch("session")("https://example.com", { method: "HEAD" });
  expect(response.body).toBeNull();
  vi.mocked(invoke).mockRejectedValue("网络连接失败");
  await expect(createPluginFetch("session")("https://example.com")).rejects.toThrow(TypeError);
});
it("文件逐块填入同一字节数组，截断、越界和会话失效明确失败", async () => {
  vi.mocked(invoke).mockImplementation(async (_command, args) =>
    (args as { offset: number }).offset ? null : encodePluginBytes(new Uint8Array([255, 3]))
  );
  expect(await readProviderFile("token", { id: "file", size: 2 }, () => true)).toEqual(
    new Uint8Array([255, 3])
  );
  await expect(readProviderFile("token", { id: "file", size: 3 }, () => true)).rejects.toThrow(
    "不完整"
  );
  await expect(readProviderFile("token", { id: "file", size: 1 }, () => true)).rejects.toThrow(
    "无效"
  );
  await expect(readProviderFile("token", { id: "file", size: 2 }, () => false)).rejects.toThrow(
    "会话"
  );
});
it("输出逐块等待写入完成，再写下一块", async () => {
  const bytes = new Uint8Array(FETCH_CHUNK_BYTES + 17).fill(23);
  let finish!: () => void;
  vi.mocked(invoke).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = () => resolve(undefined);
      })
  );
  const pending = writeProviderFile("token", "sink", bytes, () => true);
  await Promise.resolve();
  expect(invoke).toHaveBeenCalledTimes(1);
  finish();
  await pending;
  const writes = vi
    .mocked(invoke)
    .mock.calls.map(([, args]) => args as { offset: number; chunk: string });
  expect(writes.map(item => [item.offset, decodePluginBytes(item.chunk).length])).toEqual([
    [0, FETCH_CHUNK_BYTES],
    [FETCH_CHUNK_BYTES, 17],
  ]);
});
it("本机上传请求串行加载文件，上一提供方执行结束才读下一文件", async () => {
  let receive!: (event: { payload: unknown }) => Promise<void>;
  vi.mocked(listen).mockImplementation(async (_event, handler) => {
    receive = handler as typeof receive;
    return () => undefined;
  });
  vi.mocked(invoke).mockImplementation(async (command, args) =>
    command === "plugin_data_read"
      ? { cursor: 0, events: [] }
      : command === "plugin_permissions_read"
        ? {}
        : command === "plugin_transport_connect"
          ? "token"
          : command === "plugin_file_read"
            ? (args as { offset: number }).offset
              ? null
              : encodePluginBytes(new Uint8Array([1]))
            : undefined
  );
  let finish!: () => void;
  const uploadOwned = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = () => resolve("https://example.com/one");
        })
    )
    .mockResolvedValue("https://example.com/two");
  const runtime = {
    workspaceId: "db",
    upload: { uploadOwned },
    sync: { execute: vi.fn() },
    host: { subscribe: vi.fn(() => vi.fn()) },
    subscribe: vi.fn(() => vi.fn()),
    getActiveAiPackages: () => [],
  } as unknown as MobilePluginRuntime;
  const disconnect = await connectMobilePluginTransport(runtime);
  const payload = {
    token: "token",
    requestId: "1",
    kind: "upload",
    pluginId: "plugin",
    config: {},
    file: { id: "one", size: 1 },
  };
  const first = receive({ payload });
  await vi.waitFor(() => expect(uploadOwned).toHaveBeenCalledTimes(1));
  const second = receive({ payload: { ...payload, requestId: "2", file: { id: "two", size: 1 } } });
  await Promise.resolve();
  expect(
    vi.mocked(invoke).mock.calls.filter(([command]) => command === "plugin_file_read")
  ).toHaveLength(2);
  finish();
  await Promise.all([first, second]);
  expect(uploadOwned).toHaveBeenCalledTimes(2);
  disconnect();
});

it.each(["downloadFile", "uploadFile"] as const)(
  "同步 %s 并发执行，同一会话只打开一次",
  async method => {
    let receive!: (event: { payload: unknown }) => Promise<void>;
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      receive = handler as typeof receive;
      return () => undefined;
    });
    vi.mocked(invoke).mockImplementation(async (command, args) =>
      command === "plugin_data_read"
        ? { cursor: 0, events: [] }
        : command === "plugin_permissions_read"
          ? {}
          : command === "plugin_transport_connect"
            ? "token"
            : command === "plugin_file_read"
              ? (args as { offset: number }).offset
                ? null
                : encodePluginBytes(new Uint8Array([1]))
              : undefined
    );
    const complete: ((value: unknown) => void)[] = [];
    const execute = vi.fn(async (request: { kind: string; args?: unknown[] }) =>
      request.kind === "call" ? new Promise(resolve => complete.push(resolve)) : undefined
    );
    const runtime = {
      workspaceId: "db",
      sync: { execute },
      upload: {},
      host: { subscribe: vi.fn(() => vi.fn()) },
      subscribe: vi.fn(() => vi.fn()),
      getActiveAiPackages: () => [],
    } as unknown as MobilePluginRuntime;
    const disconnect = await connectMobilePluginTransport(runtime);
    const requests = ["one", "two", "three"].map(id =>
      receive({
        payload: {
          token: "token",
          requestId: id,
          kind: "sync",
          session: "session",
          pluginId: "sync.plugin",
          config: {},
          method,
          name: id,
          file: { id, size: method === "downloadFile" ? 0 : 1 },
        },
      })
    );
    await vi.waitFor(() => expect(complete).toHaveLength(3));
    expect(execute.mock.calls.filter(([request]) => request.kind === "open")).toHaveLength(1);
    complete[1](method === "downloadFile" ? new Uint8Array([2]) : true);
    complete[0](method === "downloadFile" ? new Uint8Array([1]) : true);
    complete[2](method === "downloadFile" ? new Uint8Array([3]) : true);
    await Promise.all(requests);
    const writes = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "plugin_file_write")
      .map(([, args]) => args as { id: string; chunk: string });
    expect(
      Object.fromEntries(writes.map(({ id, chunk }) => [id, [...decodePluginBytes(chunk)]]))
    ).toEqual(method === "downloadFile" ? { one: [1], two: [2], three: [3] } : {});
    if (method === "uploadFile") {
      const calls = execute.mock.calls.filter(([request]) => request.kind === "call");
      expect(calls.map(([request]) => request.args)).toEqual([
        ["one", new Uint8Array([1])],
        ["two", new Uint8Array([1])],
        ["three", new Uint8Array([1])],
      ]);
    }
    expect(
      vi.mocked(invoke).mock.calls.filter(([command]) => command === "plugin_transport_reply")
    ).toHaveLength(3);
    disconnect();
  }
);

it("宿主可给同步对象设置响应预算，普通公网请求不附加预算", async () => {
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_fetch_open" ? 7 : { ...metadata, status: 204, hasBody: false }
  );
  const request = createPluginFetch("token", id =>
    id === "sync.plugin" ? 16 * 1024 * 1024 : undefined
  );
  await request("https://example.com", undefined, "sync.plugin");
  await request("https://example.com");
  const calls = vi.mocked(invoke).mock.calls.filter(([command]) => command === "plugin_fetch_open");
  expect(calls[0][1]).toMatchObject({ request: { responseLimit: 16 * 1024 * 1024 } });
  expect(calls[1][1]).toMatchObject({ request: { responseLimit: undefined } });
});

it("并发同步元数据调用共享响应预算，全部完成后才解除", async () => {
  let receive!: (event: { payload: unknown }) => Promise<void>;
  vi.mocked(listen).mockImplementation(async (_event, handler) => {
    receive = handler as typeof receive;
    return () => undefined;
  });
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_data_read"
      ? { cursor: 0, events: [] }
      : command === "plugin_permissions_read"
        ? {}
        : command === "plugin_transport_connect"
          ? "token"
          : command === "plugin_fetch_open"
            ? 1
            : command === "plugin_fetch_response"
              ? { ...metadata, status: 204, hasBody: false }
              : undefined
  );
  const complete: ((value: unknown) => void)[] = [];
  const execute = vi.fn(async (request: { kind: string }) =>
    request.kind === "call" ? new Promise(resolve => complete.push(resolve)) : undefined
  );
  const runtime = {
    workspaceId: "db",
    sync: { execute },
    upload: {},
    host: { subscribe: vi.fn(() => vi.fn()) },
    subscribe: vi.fn(() => vi.fn()),
    getActiveAiPackages: () => [],
  } as unknown as MobilePluginRuntime;
  const disconnect = await connectMobilePluginTransport(runtime);
  const payload = {
    token: "token",
    kind: "sync",
    session: "session",
    pluginId: "sync.plugin",
    config: {},
    method: "fileExists",
    name: "file",
  };
  const first = receive({ payload: { ...payload, requestId: "1" } });
  const second = receive({ payload: { ...payload, requestId: "2" } });
  await vi.waitFor(() => expect(complete).toHaveLength(2));
  complete[0](false);
  await first;
  await runtime.fetch!("https://example.com", undefined, "sync.plugin");
  expect(
    vi.mocked(invoke).mock.calls.find(([command]) => command === "plugin_fetch_open")?.[1]
  ).toMatchObject({ request: { responseLimit: 16 * 1024 * 1024 } });
  complete[1](false);
  await second;
  await runtime.fetch!("https://example.com", undefined, "sync.plugin");
  const requests = vi
    .mocked(invoke)
    .mock.calls.filter(([command]) => command === "plugin_fetch_open");
  expect(requests.at(-1)?.[1]).toMatchObject({ request: { responseLimit: undefined } });
  disconnect();
});
