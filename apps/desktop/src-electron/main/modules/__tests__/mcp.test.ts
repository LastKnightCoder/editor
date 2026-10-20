import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  const transports: Array<{ onclose?: () => void | Promise<void> }> = [];
  class MockStdioClientTransport {
    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public config: Record<string, unknown>;

    constructor(config: Record<string, unknown>) {
      this.config = config;
      transports.push(this);
    }

    async close(): Promise<void> {}
  }

  class MockClient {
    public connect = vi.fn(async () => undefined);
    public close = vi.fn(async () => undefined);
    public listTools = vi.fn(async () => ({ tools: [] }));
    public callTool = vi.fn(async () => ({ content: [], isError: false }));
  }

  const ipcMainHandleMock = vi.fn();

  return {
    MockStdioClientTransport,
    MockClient,
    ipcMainHandleMock,
    appMock: {
      getVersion: vi.fn(() => "0.44.0"),
      on: vi.fn(),
    },
    browserWindowMock: {
      getAllWindows: vi.fn(() => []),
    },
    resolveMcpCommandMock: vi.fn(),
    buildMcpSpawnEnvMock: vi.fn(),
    transports,
  };
});

vi.mock("electron", () => ({
  ipcMain: {
    handle: (...args: unknown[]) => mockContext.ipcMainHandleMock(...args),
  },
  app: mockContext.appMock,
  BrowserWindow: mockContext.browserWindowMock,
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn(() => new mockContext.MockClient()),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: mockContext.MockStdioClientTransport,
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

vi.mock("../../utils/mcpCommandResolver", () => ({
  resolveMcpCommand: (...args: unknown[]) => mockContext.resolveMcpCommandMock(...args),
  buildMcpSpawnEnv: (...args: unknown[]) => mockContext.buildMcpSpawnEnvMock(...args),
}));
vi.mock("../plugin-backend", () => ({
  authorizePluginMcp: vi.fn(async () => {
    const controller = new AbortController();
    return {
      parameters: { command: "guardian", args: [], env: {} },
      validate: vi.fn(async () => controller.signal.throwIfAborted()),
      signal: controller.signal,
      dispose: () => controller.abort(),
      onClose: (close: () => Promise<void>) =>
        controller.signal.addEventListener("abort", () => void close(), { once: true }),
    };
  }),
}));

import mcpModule from "../mcp";

describe("mcp module", () => {
  const handler = (channel: string) =>
    mockContext.ipcMainHandleMock.mock.calls.find(([name]) => name === channel)![1] as (
      event: unknown,
      payload: Record<string, unknown>
    ) => Promise<unknown>;
  const server = (id: string) => ({
    id,
    name: "插件服务器",
    enabled: true,
    transport: { type: "stdio", command: "node" },
  });
  beforeEach(() => {
    mockContext.ipcMainHandleMock.mockReset();
    mockContext.appMock.getVersion.mockClear();
    mockContext.appMock.on.mockClear();
    mockContext.resolveMcpCommandMock.mockReset();
    mockContext.buildMcpSpawnEnvMock.mockReset();
    mockContext.resolveMcpCommandMock.mockReturnValue(
      "/Users/test/.nvm/versions/node/v24.1.0/bin/npx"
    );
    mockContext.buildMcpSpawnEnvMock.mockReturnValue({
      PATH: "/custom/bin",
      FOO: "bar",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("stdio 连接应使用标准化后的 command 与 env", async () => {
    await mcpModule.init();

    const connectHandler = mockContext.ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === "mcp-connect"
    )?.[1] as
      | ((_event: EventEmitter, payload: { server: Record<string, unknown> }) => Promise<void>)
      | undefined;

    expect(connectHandler).toBeTypeOf("function");

    await connectHandler!(new EventEmitter(), {
      server: {
        id: "server-1",
        name: "chart",
        enabled: true,
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@antv/mcp-server-chart"],
          env: { FOO: "bar" },
          cwd: "/tmp/project",
        },
      },
    });

    expect(mockContext.buildMcpSpawnEnvMock).toHaveBeenCalledWith({
      FOO: "bar",
    });
    expect(mockContext.resolveMcpCommandMock).toHaveBeenCalledWith("npx", {
      PATH: "/custom/bin",
      FOO: "bar",
    });
  });

  it("底层 spawn ENOENT 时应抛出可读错误", async () => {
    const clientInstance = new mockContext.MockClient();
    clientInstance.connect.mockRejectedValueOnce(new Error("spawn npx ENOENT"));
    const clientCtor = await import("@modelcontextprotocol/sdk/client/index.js");
    vi.mocked(clientCtor.Client).mockImplementationOnce(() => clientInstance as never);

    await mcpModule.init();

    const connectHandler = mockContext.ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === "mcp-connect"
    )?.[1] as
      | ((_event: EventEmitter, payload: { server: Record<string, unknown> }) => Promise<void>)
      | undefined;

    await expect(
      connectHandler!(new EventEmitter(), {
        server: {
          id: "server-2",
          name: "chart",
          enabled: true,
          transport: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@antv/mcp-server-chart"],
          },
        },
      })
    ).rejects.toThrow(/未找到可执行命令 "npx"/);
  });

  it("连接过程写入日志，可经 mcp-get-logs 读取并清空", async () => {
    await mcpModule.init();
    const handler = (channel: string) =>
      mockContext.ipcMainHandleMock.mock.calls.find(([c]) => c === channel)?.[1] as (
        _event: EventEmitter,
        payload: Record<string, unknown>
      ) => Promise<unknown>;

    await handler("mcp-connect")(new EventEmitter(), {
      server: {
        id: "server-log",
        name: "chart",
        enabled: true,
        transport: { type: "stdio", command: "npx", args: ["-y", "pkg"] },
      },
    });

    const logs = (await handler("mcp-get-logs")(new EventEmitter(), {
      serverId: "server-log",
    })) as Array<{ level: string; text: string }>;
    expect(logs.map(l => l.text)).toEqual(["启动进程 npx -y pkg", "连接成功"]);

    await handler("mcp-clear-logs")(new EventEmitter(), { serverId: "server-log" });
    expect(await handler("mcp-get-logs")(new EventEmitter(), { serverId: "server-log" })).toEqual(
      []
    );
  });

  it("插件窗口关闭回收其连接，其他窗口和手动服务器不受影响", async () => {
    await mcpModule.init();
    const sender = new EventEmitter();
    const other = new EventEmitter();
    await handler("mcp-connect")(
      { sender },
      { server: server("plugin:window-A"), windowScoped: true, pluginId: "test.mcp" }
    );
    await handler("mcp-connect")(
      { sender: other },
      { server: server("plugin:window-B"), windowScoped: true, pluginId: "test.mcp" }
    );
    await handler("mcp-connect")({}, { server: server("manual") });
    sender.emit("destroyed");
    await vi.waitFor(async () =>
      expect(await handler("mcp-is-connected")({}, { serverId: "plugin:window-A" })).toBe(false)
    );
    expect(await handler("mcp-is-connected")({}, { serverId: "plugin:window-B" })).toBe(true);
    expect(await handler("mcp-is-connected")({}, { serverId: "manual" })).toBe(true);
    await handler("mcp-disconnect")({ sender: other }, { serverId: "plugin:window-B" });
    await handler("mcp-disconnect")({}, { serverId: "manual" });
  });

  it("连接握手期间停用，迟到的握手成功不能复活连接", async () => {
    let resolve!: () => void;
    const client = new mockContext.MockClient();
    client.connect.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = () => done(undefined);
        })
    );
    const sdk = await import("@modelcontextprotocol/sdk/client/index.js");
    vi.mocked(sdk.Client).mockImplementationOnce(() => client as never);
    await mcpModule.init();
    const sender = new EventEmitter();
    const pending = handler("mcp-connect")(
      { sender },
      { server: server("plugin:pending"), windowScoped: true, pluginId: "test.mcp" }
    );
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(client.connect).toHaveBeenCalled());
    await handler("mcp-disconnect")({ sender }, { serverId: "plugin:pending" });
    expect(client.close).toHaveBeenCalled();
    resolve();
    await rejected;
    expect(await handler("mcp-is-connected")({}, { serverId: "plugin:pending" })).toBe(false);
  });

  it("重连退避期间停用，定时器结束后不再启动进程", async () => {
    await mcpModule.init();
    const sender = new EventEmitter();
    await handler("mcp-connect")(
      { sender },
      { server: server("plugin:retry"), windowScoped: true, pluginId: "test.mcp" }
    );
    const transport = mockContext.transports.at(-1)!;
    const sdk = await import("@modelcontextprotocol/sdk/client/index.js");
    const count = vi.mocked(sdk.Client).mock.calls.length;
    vi.useFakeTimers();
    const retry = transport.onclose!();
    await handler("mcp-disconnect")({ sender }, { serverId: "plugin:retry" });
    await vi.advanceTimersByTimeAsync(1000);
    await retry;
    expect(vi.mocked(sdk.Client)).toHaveBeenCalledTimes(count);
  });
  it("插件连接缺少来源时不启动，其他窗口不能使用已授权连接", async () => {
    await mcpModule.init();
    const sender = new EventEmitter();
    const native = server("plugin:guarded");
    const count = mockContext.transports.length;
    await expect(
      handler("mcp-connect")({ sender }, { server: native, windowScoped: true })
    ).rejects.toThrow("来源");
    expect(mockContext.transports).toHaveLength(count);
    await handler("mcp-connect")(
      { sender },
      { server: native, windowScoped: true, pluginId: "test.mcp" }
    );
    await expect(
      handler("mcp-list-tools")({ sender: new EventEmitter() }, { serverId: native.id })
    ).rejects.toThrow("当前窗口");
    await handler("mcp-disconnect")({ sender }, { serverId: native.id });
  });
});
