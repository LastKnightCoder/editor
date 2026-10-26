import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/mcp/providers", () => ({
  MCP_PROVIDERS: [{ id: "test.provider", defaultEnabled: true }],
}));

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

it("读取当前传输配置与启用意图，补默认提供方且不改写存储", async () => {
  const customServers = [
    { id: "a", name: "服务", enabled: false, transport: { type: "stdio", command: "server" } },
    {
      id: "b",
      name: "远端",
      enabled: true,
      transport: { type: "streamable-http", url: "https://example.invalid/mcp" },
    },
  ];
  const raw = JSON.stringify({ version: 0, state: { customServers, providerStates: {} } });
  localStorage.setItem("mcp-store", raw);
  const { default: store } = await import("../useMCPStore");
  expect(store.getState().customServers).toEqual(customServers);
  expect(store.getState().providerStates).toEqual({ "test.provider": { enabled: true } });
  expect(localStorage.getItem("mcp-store")).toBe(raw);
});

it("旧服务器格式不转换或连接，原存储保留，修正后可重新读取", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const raw = JSON.stringify({
    version: 0,
    state: {
      customServers: [
        {
          id: "a",
          name: "旧服务",
          enabled: true,
          baseUrl: "https://example.invalid",
          apiKey: "fixture",
        },
      ],
    },
  });
  localStorage.setItem("mcp-store", raw);
  const { default: store } = await import("../useMCPStore");
  expect(store.getState().customServers).toEqual([]);
  expect(localStorage.getItem("mcp-store")).toBe(raw);
  const customServers = [
    { id: "a", name: "服务", enabled: false, transport: { type: "stdio", command: "server" } },
  ];
  localStorage.setItem("mcp-store", JSON.stringify({ version: 0, state: { customServers } }));
  await store.persist.rehydrate();
  expect(store.getState().customServers).toEqual(customServers);
});
