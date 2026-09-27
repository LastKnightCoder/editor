import { describe, expect, it, vi } from "vitest";
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

describe("外部 MCP 风险声明", () => {
  it("远端工具默认声明 execute，不能因缺省风险绕过 pi 宿主审批", async () => {
    const tools = await fetchToolsFromServer({ id: "remote", enabled: true } as CustomMCPServer);
    expect(tools).toMatchObject([{ name: "remote_tool", risk: "execute" }]);
  });
});
