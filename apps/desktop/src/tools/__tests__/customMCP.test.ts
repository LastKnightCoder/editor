import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { webcrypto } from "node:crypto";
import { fetchToolsFromServer } from "../customMCP";
import type { CustomMCPServer } from "@/stores/useMCPStore";

vi.mock("@/commands", () => ({
  callMcpTool: vi.fn(),
  connectMcpServer: vi.fn(),
  disconnectMcpServer: vi.fn(),
  ensureModule: vi.fn().mockResolvedValue(undefined),
  isMcpServerConnected: vi.fn().mockResolvedValue(true),
  listMcpServerTools: vi.fn().mockResolvedValue([
    {
      name: "remote_tool",
      description: "远端操作",
      inputSchema: { type: "object", properties: {} },
    },
  ]),
  reconnectMcpServer: vi.fn(),
}));
vi.mock("@/stores/useMCPStore", () => ({ default: { getState: vi.fn() } }));
beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

describe("外部 MCP 风险声明", () => {
  it("相同工具改连其他服务时执行身份改变，身份不暴露凭据", async () => {
    const first = await fetchToolsFromServer({
      id: "remote",
      name: "测试服务",
      enabled: true,
      transport: {
        type: "streamable-http",
        url: "https://a.invalid",
        headers: { Authorization: "test-only" },
      },
    });
    const second = await fetchToolsFromServer({
      id: "remote",
      name: "测试服务",
      enabled: true,
      transport: {
        type: "streamable-http",
        url: "https://b.invalid",
        headers: { Authorization: "test-only" },
      },
    });
    expect(first[0].executionIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(first[0].executionIdentity).not.toBe(second[0].executionIdentity);
    expect(first[0].executionIdentity).not.toContain("test-only");
  });
  it("远端工具默认声明 execute，不能因缺省风险绕过 pi 宿主审批", async () => {
    const tools = await fetchToolsFromServer({ id: "remote", enabled: true } as CustomMCPServer);
    expect(tools).toMatchObject([{ name: "remote_tool", risk: "execute" }]);
  });
});
