// @vitest-environment node
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { PluginContext } from "@tau/plugins";
import { createMobilePluginMcp } from "./ai-mcp";
import { createMobileAiService } from "../../services/ai/service";
import * as native from "../../services/ai/native";

vi.mock("../../services/ai/native", () => ({
  acquireLibrary: vi.fn(),
  assertLibrary: vi.fn(),
  releaseLibrary: vi.fn(),
  setRunActive: vi.fn(),
  createSession: vi.fn(),
  readSession: vi.fn(),
  patchSession: vi.fn(),
  removeSession: vi.fn(),
  listSessions: vi.fn(),
  commitSession: vi.fn(),
  getModelConfig: vi.fn(),
  createModelFetch: vi.fn(),
  createMcpFetch: vi.fn(),
}));
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.resetAllMocks();
});

async function remoteFixture() {
  const sessions = new Map<string, { rpc: Server; transport: StreamableHTTPServerTransport }>();
  const server = createServer(async (request, response) => {
    try {
      let body: { method?: string } | undefined;
      if (request.method === "POST") {
        let text = "";
        for await (const chunk of request) text += chunk;
        body = JSON.parse(text);
      }
      const id = request.headers["mcp-session-id"];
      let connection = typeof id === "string" ? sessions.get(id) : undefined;
      if (!connection && body?.method === "initialize") {
        const rpc = new Server(
          { name: "validation", version: "1" },
          { capabilities: { tools: {} } }
        );
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: sessionId => {
            sessions.set(sessionId, { rpc, transport });
          },
        });
        rpc.setRequestHandler(ListToolsRequestSchema, async () => ({
          tools: [{ name: "lookup", description: "读取测试卡片", inputSchema: { type: "object" } }],
        }));
        await rpc.connect(transport);
        connection = { rpc, transport };
      }
      if (!connection) {
        response.writeHead(400).end();
        return;
      }
      await connection.transport.handleRequest(request, response, body);
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(async () => {
    await Promise.all([...sessions.values()].map(connection => connection.rpc.close()));
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
}

it("真实服务暂停关闭远程连接后，插件快照仍可观察disconnected且恢复不重连", async () => {
  const url = await remoteFixture();
  const lease = { leaseId: "test-lease", databaseName: "one.db", generation: 1 };
  vi.mocked(native.acquireLibrary).mockResolvedValue(lease);
  vi.mocked(native.assertLibrary).mockResolvedValue(lease);
  vi.mocked(native.releaseLibrary).mockResolvedValue(undefined);
  const close = vi.fn(async () => undefined);
  vi.mocked(native.createMcpFetch).mockResolvedValue({ fetch, dispose: close });
  const ai = createMobileAiService();
  cleanups.push(() => ai.lifecycle.dispose());
  const plugin = createMobilePluginMcp({ databaseName: "one.db", ai: () => ai });
  cleanups.push(plugin.dispose);
  const controller = new AbortController();
  const context = {
    pluginId: "test.plugin",
    workspaceId: "one.db",
    signal: controller.signal,
  } as PluginContext;
  plugin.adapter.register(
    context,
    { id: "remote", name: "远程工具", transport: { type: "streamable-http", url } },
    { id: "test.plugin", name: "测试", executionIdentity: "activation-1" }
  );
  await plugin.ready();
  expect(plugin.getSnapshot()[0].status).toBe("connected");
  await ai.lifecycle.suspend();
  expect(close).toHaveBeenCalledOnce();
  expect(plugin.getSnapshot()[0]).toMatchObject({ status: "disconnected", toolIds: [] });
  await ai.lifecycle.resume();
  expect(plugin.getSnapshot()[0].status).toBe("disconnected");
  expect(native.createMcpFetch).toHaveBeenCalledOnce();
});
