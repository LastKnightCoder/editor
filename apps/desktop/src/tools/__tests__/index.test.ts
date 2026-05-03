import { beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  const subscribeCallbacks: Array<(state: any, prevState: any) => void> = [];
  const settingSubscribeCallbacks: Array<(state: any, prevState: any) => void> =
    [];

  const mcpState = {
    providerStates: {},
    customServers: [
      {
        id: "server-1",
        name: "@tokenizin/mcp-npx-fetch",
        enabled: true,
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@tokenizin/mcp-npx-fetch"],
        },
      },
    ],
    connectionStatus: {},
    connectionErrors: {},
    isProviderEnabled: vi.fn(() => false),
    getCustomServer: vi.fn((id: string) =>
      mcpState.customServers.find((server) => server.id === id),
    ),
    setConnectionStatus: vi.fn(),
  };

  const useMCPStoreMock: any = (
    selector: (state: typeof mcpState) => unknown,
  ) => selector(mcpState);
  useMCPStoreMock.getState = vi.fn(() => mcpState);
  useMCPStoreMock.subscribe = vi.fn(
    (callback: (state: any, prevState: any) => void) => {
      subscribeCallbacks.push(callback);
      return () => {};
    },
  );

  const settingState = {
    setting: {
      imageGeneration: {},
    },
  };
  const useSettingStoreMock: any = {
    getState: vi.fn(() => settingState),
    subscribe: vi.fn((callback: (state: any, prevState: any) => void) => {
      settingSubscribeCallbacks.push(callback);
      return () => {};
    }),
  };

  return {
    subscribeCallbacks,
    settingSubscribeCallbacks,
    mcpState,
    useMCPStoreMock,
    useSettingStoreMock,
    registerBuiltinToolsMock: vi.fn(),
    fetchToolsFromServerMock: vi.fn(),
    onConnectionStatusChangeMock: vi.fn(),
    toolRegistryMock: {
      unregisterSource: vi.fn(),
      registerTools: vi.fn(),
      setSourceEnabled: vi.fn(),
      hasSource: vi.fn(() => false),
    },
  };
});

vi.mock("@/stores/useMCPStore", () => ({
  __esModule: true,
  default: mockContext.useMCPStoreMock,
}));

vi.mock("@/stores/useSettingStore", () => ({
  __esModule: true,
  default: mockContext.useSettingStoreMock,
}));

vi.mock("../builtinTools", () => ({
  registerBuiltinTools: (...args: unknown[]) =>
    mockContext.registerBuiltinToolsMock(...args),
}));

vi.mock("../customMCP", () => ({
  fetchToolsFromServer: (...args: unknown[]) =>
    mockContext.fetchToolsFromServerMock(...args),
  onConnectionStatusChange: (...args: unknown[]) =>
    mockContext.onConnectionStatusChangeMock(...args),
}));

vi.mock("../toolRegistry", () => ({
  __esModule: true,
  default: mockContext.toolRegistryMock,
  ToolRegistry: class {},
}));

vi.mock("@/mcp/providers", () => ({
  MCP_PROVIDERS: [],
}));

describe("tools/index", () => {
  beforeEach(() => {
    vi.resetModules();
    mockContext.fetchToolsFromServerMock.mockReset();
    mockContext.fetchToolsFromServerMock.mockResolvedValue([
      {
        name: "fetch_url",
        description: "fetch",
        parameters: { type: "object", properties: {} },
        executor: vi.fn(),
      },
    ]);
    mockContext.onConnectionStatusChangeMock.mockReset();
    mockContext.onConnectionStatusChangeMock.mockReturnValue(() => {});
    mockContext.toolRegistryMock.unregisterSource.mockReset();
    mockContext.toolRegistryMock.registerTools.mockReset();
    mockContext.toolRegistryMock.setSourceEnabled.mockReset();
    mockContext.toolRegistryMock.hasSource.mockReset();
    mockContext.toolRegistryMock.hasSource.mockReturnValue(false);
    mockContext.mcpState.setConnectionStatus.mockReset();
  });

  it("初始化后应为已启用自定义 MCP 同步 connected 状态", async () => {
    const toolsModule = await import("../index");

    toolsModule.initializeTooling();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockContext.fetchToolsFromServerMock).toHaveBeenCalledWith(
      mockContext.mcpState.customServers[0],
    );
    expect(mockContext.mcpState.setConnectionStatus).toHaveBeenNthCalledWith(
      1,
      "server-1",
      "connecting",
    );
    expect(mockContext.mcpState.setConnectionStatus).toHaveBeenNthCalledWith(
      2,
      "server-1",
      "connected",
    );
  });

  it("初始化时应全局订阅 MCP 连接状态变化", async () => {
    const toolsModule = await import("../index");

    toolsModule.initializeTooling();

    expect(mockContext.onConnectionStatusChangeMock).toHaveBeenCalledTimes(1);
  });
});
