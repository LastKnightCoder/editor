import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  class MockStdioClientTransport {
    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public config: Record<string, unknown>;

    constructor(config: Record<string, unknown>) {
      this.config = config;
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
  resolveMcpCommand: (...args: unknown[]) =>
    mockContext.resolveMcpCommandMock(...args),
  buildMcpSpawnEnv: (...args: unknown[]) =>
    mockContext.buildMcpSpawnEnvMock(...args),
}));

import mcpModule from "../mcp";

describe("mcp module", () => {
  beforeEach(() => {
    mockContext.ipcMainHandleMock.mockReset();
    mockContext.appMock.getVersion.mockClear();
    mockContext.appMock.on.mockClear();
    mockContext.resolveMcpCommandMock.mockReset();
    mockContext.buildMcpSpawnEnvMock.mockReset();
    mockContext.resolveMcpCommandMock.mockReturnValue(
      "/Users/test/.nvm/versions/node/v24.1.0/bin/npx",
    );
    mockContext.buildMcpSpawnEnvMock.mockReturnValue({
      PATH: "/custom/bin",
      FOO: "bar",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stdio 连接应使用标准化后的 command 与 env", async () => {
    await mcpModule.init();

    const connectHandler = mockContext.ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === "mcp-connect",
    )?.[1] as
      | ((
          _event: EventEmitter,
          payload: { server: Record<string, unknown> },
        ) => Promise<void>)
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
    const clientCtor =
      await import("@modelcontextprotocol/sdk/client/index.js");
    vi.mocked(clientCtor.Client).mockImplementationOnce(
      () => clientInstance as never,
    );

    await mcpModule.init();

    const connectHandler = mockContext.ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === "mcp-connect",
    )?.[1] as
      | ((
          _event: EventEmitter,
          payload: { server: Record<string, unknown> },
        ) => Promise<void>)
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
      }),
    ).rejects.toThrow(/未找到可执行命令 "npx"/);
  });
});
