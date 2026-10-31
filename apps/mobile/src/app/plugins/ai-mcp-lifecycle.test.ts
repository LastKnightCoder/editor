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
  const methods: string[] = [];
  const sessions = new Map<string, { rpc: Server; transport: StreamableHTTPServerTransport }>();
  const server = createServer(async (request, response) => {
    try {
      let body: { method?: string } | undefined;
      if (request.method === "POST") {
        let text = "";
        for await (const chunk of request) text += chunk;
        body = JSON.parse(text);
        if (body?.method) methods.push(body.method);
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
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, methods };
}

async function setupRemote(failFirst = false) {
  const { url, methods } = await remoteFixture();
  const lease = { leaseId: "test-lease", databaseName: "one.db", generation: 1 };
  vi.mocked(native.acquireLibrary).mockResolvedValue(lease);
  vi.mocked(native.assertLibrary).mockResolvedValue(lease);
  vi.mocked(native.releaseLibrary).mockResolvedValue(undefined);
  const close = vi.fn(async () => undefined);
  vi.mocked(native.createMcpFetch).mockResolvedValue({ fetch, dispose: close });
  if (failFirst)
    vi.mocked(native.createMcpFetch).mockResolvedValueOnce({
      fetch: async () => {
        throw new TypeError("网络已断开");
      },
      dispose: vi.fn(async () => undefined),
    });
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
  if (failFirst)
    await expect(plugin.ready()).rejects.toMatchObject({ code: "AI_MCP_CONNECTION_FAILED" });
  else await plugin.ready();
  return { ai, plugin, close, methods, context, url };
}

it("真实 HTTP MCP 回前台重新发现工具，重复恢复共用连接且不沿用执行身份", async () => {
  const { ai, plugin, close, methods } = await setupRemote();
  expect(plugin.getSnapshot()[0].status).toBe("connected");
  const before = ai.tools.list({ databaseName: "one.db" });
  await ai.lifecycle.suspend();
  expect(close).toHaveBeenCalledOnce();
  expect(plugin.getSnapshot()[0]).toMatchObject({ status: "disconnected", toolIds: [] });
  await Promise.all([ai.lifecycle.resume(), ai.lifecycle.resume()]);
  expect(plugin.getSnapshot()[0].status).toBe("connected");
  expect(native.createMcpFetch).toHaveBeenCalledTimes(2);
  const after = ai.tools.list({ databaseName: "one.db" });
  expect(after.map(tool => tool.id)).toEqual(before.map(tool => tool.id));
  expect(after[0].executionIdentity).not.toBe(before[0].executionIdentity);
  expect(ai.tools.list({ databaseName: "other.db" })).toEqual([]);
  expect(methods.filter(method => method === "initialize")).toHaveLength(2);
  expect(methods).not.toContain("tools/call");
});

it.each(["停用", "切库"])("后台%s撤销声明，回前台不能复活旧 MCP", async action => {
  const { ai, plugin } = await setupRemote();
  await ai.lifecycle.suspend();
  if (action === "停用") await plugin.dispose();
  else await ai.lifecycle.releaseLibrary("one.db");
  await ai.lifecycle.resume();
  expect(native.createMcpFetch).toHaveBeenCalledTimes(1);
  expect(ai.tools.list({ databaseName: "one.db" })).toEqual([]);
});

it.each(["插件停用", "切库"])("恢复中的原生连接遇到%s，释放迟到结果且不发布工具", async action => {
  const { ai, plugin } = await setupRemote();
  await ai.lifecycle.suspend();
  let finish!: (value: { fetch: typeof fetch; dispose: () => Promise<void> }) => void;
  const lateClose = vi.fn(async () => undefined);
  vi.mocked(native.createMcpFetch).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const restoring = ai.lifecycle.resume().catch(error => error);
  await vi.waitFor(() => expect(native.createMcpFetch).toHaveBeenCalledTimes(2));
  const stopping = action === "插件停用" ? plugin.dispose() : ai.lifecycle.releaseLibrary("one.db");
  finish({ fetch, dispose: lateClose });
  await stopping;
  expect(await restoring).toMatchObject({
    code: action === "插件停用" ? "AI_MCP_CONNECTION_FAILED" : "AI_LIBRARY_BUSY",
  });
  expect(lateClose).toHaveBeenCalledOnce();
  expect(plugin.getSnapshot().every(state => state.status !== "connected")).toBe(true);
  expect(ai.tools.list({ databaseName: "one.db" })).toEqual([]);
  await ai.lifecycle.resume();
  expect(native.createMcpFetch).toHaveBeenCalledTimes(2);
});

it("恢复连接失败可观察，后续恢复可重试且插件订阅保持有效", async () => {
  const { ai, plugin } = await setupRemote();
  await ai.lifecycle.suspend();
  vi.mocked(native.createMcpFetch).mockResolvedValueOnce({
    fetch: async () => {
      throw new TypeError("网络已断开");
    },
    dispose: vi.fn(async () => undefined),
  });
  await expect(ai.lifecycle.resume()).rejects.toMatchObject({ code: "AI_MCP_CONNECTION_FAILED" });
  expect(plugin.getSnapshot()[0]).toMatchObject({ status: "error", toolIds: [] });
  await ai.lifecycle.resume();
  expect(plugin.getSnapshot()[0].status).toBe("connected");
  expect(native.createMcpFetch).toHaveBeenCalledTimes(3);
});

it("首次连接失败后仍保留状态订阅，恢复前台后能发布新工具", async () => {
  const { ai, plugin } = await setupRemote(true);
  expect(plugin.getSnapshot()[0]).toMatchObject({ status: "error", toolIds: [] });
  await ai.lifecycle.resume();
  expect(plugin.getSnapshot()[0].status).toBe("connected");
  expect(ai.tools.list({ databaseName: "one.db" })).toHaveLength(1);
});

it("一个 MCP 恢复失败不阻止其他连接恢复", async () => {
  const { ai, plugin, context, url } = await setupRemote();
  plugin.adapter.register(
    context,
    { id: "second", name: "第二个远程工具", transport: { type: "streamable-http", url } },
    { id: "test.plugin", name: "测试", executionIdentity: "activation-1" }
  );
  await plugin.ready();
  await ai.lifecycle.suspend();
  vi.mocked(native.createMcpFetch).mockResolvedValueOnce({
    fetch: async () => {
      throw new TypeError("连接失败");
    },
    dispose: vi.fn(async () => undefined),
  });
  await expect(ai.lifecycle.resume()).rejects.toMatchObject({ code: "AI_MCP_CONNECTION_FAILED" });
  expect(plugin.getSnapshot().map(state => [state.mcpId, state.status])).toEqual([
    ["remote", "error"],
    ["second", "connected"],
  ]);
});

it("恢复中再次进入后台，中止迟到连接并在下一次前台重新建立", async () => {
  const { ai, plugin } = await setupRemote();
  await ai.lifecycle.suspend();
  let finish!: (value: { fetch: typeof fetch; dispose: () => Promise<void> }) => void;
  const lateClose = vi.fn(async () => undefined);
  vi.mocked(native.createMcpFetch).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const restoring = ai.lifecycle.resume().catch(error => error);
  await vi.waitFor(() => expect(native.createMcpFetch).toHaveBeenCalledTimes(2));
  const suspending = ai.lifecycle.suspend();
  finish({ fetch, dispose: lateClose });
  await suspending;
  expect(await restoring).toMatchObject({ code: "AI_LIBRARY_BUSY" });
  expect(lateClose).toHaveBeenCalledOnce();
  expect(plugin.getSnapshot()[0]).toMatchObject({ status: "disconnected", toolIds: [] });
  await ai.lifecycle.resume();
  expect(plugin.getSnapshot()[0].status).toBe("connected");
  expect(native.createMcpFetch).toHaveBeenCalledTimes(3);
});
