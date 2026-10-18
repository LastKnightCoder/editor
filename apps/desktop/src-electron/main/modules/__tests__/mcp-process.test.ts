// @vitest-environment node
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, expect, it, vi } from "vitest";

const ipc = vi.hoisted(
  () => new Map<string, (event: unknown, payload: Record<string, unknown>) => Promise<unknown>>()
);
vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      name: string,
      callback: (event: unknown, payload: Record<string, unknown>) => Promise<unknown>
    ) => ipc.set(name, callback),
  },
  app: { getVersion: () => "0.59.0" },
  BrowserWindow: { getAllWindows: () => [] },
}));
import mcp from "../mcp";

afterEach(async () => {
  await mcp.disconnectAll();
});

it("真实 stdio 服务完成握手、列举与调用，插件窗口关闭后进程退出", async () => {
  await mcp.init();
  const sender = new EventEmitter();
  const id = "plugin:process-test";
  await ipc.get("mcp-connect")!(
    { sender },
    {
      windowScoped: true,
      server: {
        id,
        name: "真实 MCP",
        enabled: true,
        transport: {
          type: "stdio",
          command: process.execPath,
          args: [fileURLToPath(new URL("./fixtures/plugin-mcp-server.mjs", import.meta.url))],
        },
      },
    }
  );
  expect(await ipc.get("mcp-list-tools")!({}, { serverId: id })).toMatchObject([{ name: "echo" }]);
  const result = (await ipc.get("mcp-call-tool")!(
    { sender: Object.assign(sender, { id: 1 }) },
    {
      serverId: id,
      toolName: "echo",
      args: { text: "插件 MCP" },
    }
  )) as { content: Array<{ text: string }> };
  const data = JSON.parse(result.content[0].text) as { text: string; pid: number };
  expect(data.text).toBe("插件 MCP");
  expect(data.pid).not.toBe(process.pid);
  sender.emit("destroyed");
  await vi.waitFor(async () => {
    expect(await ipc.get("mcp-is-connected")!({}, { serverId: id })).toBe(false);
    expect(() => process.kill(data.pid, 0)).toThrow();
  });
}, 15_000);

it("真实 HTTP MCP 可列举和调用，窗口退出断开客户端会话", async () => {
  const protocol = new Server(
    { name: "http-mcp-test", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  protocol.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "echo",
        description: "返回输入",
        inputSchema: { type: "object", properties: { text: { type: "string" } } },
      },
    ],
  }));
  protocol.setRequestHandler(CallToolRequestSchema, async request => ({
    content: [{ type: "text", text: String(request.params.arguments?.text) }],
  }));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  await protocol.connect(transport);
  const http = createServer((request, response) => {
    void transport.handleRequest(request, response).catch(() => {
      response.statusCode = 500;
      response.end();
    });
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("测试服务器未启动");
  const id = "plugin:http-test";
  const sender = Object.assign(new EventEmitter(), { id: 2 });
  try {
    await mcp.init();
    await ipc.get("mcp-connect")!(
      { sender },
      {
        windowScoped: true,
        server: {
          id,
          name: "HTTP MCP",
          enabled: true,
          transport: { type: "streamable-http", url: `http://127.0.0.1:${address.port}/mcp` },
        },
      }
    );
    expect(await ipc.get("mcp-list-tools")!({}, { serverId: id })).toMatchObject([
      { name: "echo" },
    ]);
    expect(
      await ipc.get("mcp-call-tool")!(
        { sender },
        { serverId: id, toolName: "echo", args: { text: "HTTP 成功" } }
      )
    ).toMatchObject({
      content: [{ type: "text", text: "HTTP 成功" }],
    });
    sender.emit("did-navigate");
    await vi.waitFor(async () =>
      expect(await ipc.get("mcp-is-connected")!({}, { serverId: id })).toBe(false)
    );
  } finally {
    await mcp.disconnectAll();
    await transport.close();
    http.closeAllConnections();
    await new Promise<void>(resolve => http.close(() => resolve()));
  }
}, 15_000);
