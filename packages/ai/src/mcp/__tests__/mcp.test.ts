import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, expect, it, vi } from "vitest";
import { AiMcpManager } from "../index";
import { AiToolRegistry } from "../../tools";
import type { AiToolExecutionContext } from "../../contracts";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

const context = (signal = new AbortController().signal): AiToolExecutionContext => ({
  session: { databaseName: "validation.db", sessionId: "session-1" },
  runId: "run-1",
  executionId: crypto.randomUUID(),
  toolCallId: crypto.randomUUID(),
  operationId: crypto.randomUUID(),
  signal,
});

async function serverFixture(options: { holdCalls?: boolean; failCalls?: boolean } = {}) {
  const sessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>();
  let calls = 0;
  let title = "读取一张测试卡片";
  const http: HttpServer = createServer(async (request, response) => {
    try {
      const sessionId = request.headers["mcp-session-id"];
      let connection = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
      let body: unknown;
      if (request.method === "POST") {
        let text = "";
        for await (const chunk of request) text += chunk;
        body = JSON.parse(text);
      }
      if (
        !connection &&
        request.method === "POST" &&
        (body as { method?: string })?.method === "initialize"
      ) {
        const server = new Server(
          { name: "validation", version: "1" },
          { capabilities: { tools: { listChanged: true } } }
        );
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: id => {
            sessions.set(id, { server, transport });
          },
        });
        server.setRequestHandler(ListToolsRequestSchema, async () => ({
          tools: [
            {
              name: "read.card",
              description: title,
              inputSchema: {
                type: "object",
                properties: { id: { type: "integer" } },
                required: ["id"],
              },
              annotations: { readOnlyHint: true },
            },
          ],
        }));
        server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
          calls++;
          if (options.holdCalls) await new Promise<void>(() => undefined);
          if (options.failCalls)
            return { content: [{ type: "text", text: "服务端明确拒绝" }], isError: true };
          return {
            content: [{ type: "text", text: `卡片 ${params.arguments?.id}` }],
            structuredContent: { id: params.arguments?.id },
          };
        });
        await server.connect(transport);
        connection = { server, transport };
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
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    await Promise.all([...sessions.values()].map(connection => connection.server.close()));
    http.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      http.close(error => (error ? reject(error) : resolve()))
    );
  });
  return {
    url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`,
    calls: () => calls,
    changeDescription: () => {
      title = "更新后的卡片工具";
    },
  };
}

it("通过官方 HTTP transport 发现和调用工具，使用注入 fetch，并保留结构化结果", async () => {
  const server = await serverFixture();
  const registry = new AiToolRegistry();
  const network = vi.fn(fetch);
  const manager = new AiMcpManager(registry, { fetch: network, timeoutMs: 2000 });
  cleanup.push(() => manager.dispose());
  const state = await manager.connect({
    id: "cards.remote",
    name: "卡片服务",
    transport: { type: "streamable-http", url: server.url },
  });
  expect(state.status).toBe("connected");
  expect(state.toolIds).toHaveLength(1);
  expect(registry.list()[0].name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  expect(registry.list()[0].risk).toBe("execute");
  const snapshot = registry.capture(state.toolIds);
  await expect(
    snapshot.execute(state.toolIds[0], { id: 9 }, context(), { interactionMode: "none" })
  ).rejects.toMatchObject({ code: "AI_INTERACTION_UNAVAILABLE" });
  expect(server.calls()).toBe(0);
  const result = await snapshot.execute(state.toolIds[0], { id: 9 }, context(), {
    interactionMode: "none",
    permissionMode: "bypass",
  });
  expect(result.content).toBe("卡片 9");
  expect(result.metadata).toMatchObject({
    mcp: { serverId: "cards.remote", toolName: "read.card", structuredContent: { id: 9 } },
  });
  expect(network).toHaveBeenCalled();
  expect(server.calls()).toBe(1);
});

it("刷新和断开撤销旧工具快照，连接代次与权限不会沿用", async () => {
  const server = await serverFixture();
  const registry = new AiToolRegistry();
  const manager = new AiMcpManager(registry, { fetch, timeoutMs: 2000 });
  cleanup.push(() => manager.dispose());
  const config = {
    id: "remote",
    name: "服务",
    transport: { type: "streamable-http" as const, url: server.url },
  };
  const state = await manager.connect(config);
  const old = registry.capture(state.toolIds);
  const previousIdentity = old.specs[0].executionIdentity;
  server.changeDescription();
  const refreshed = await manager.refreshTools(config.id);
  expect(old.isCurrent()).toBe(false);
  expect(registry.list()[0].description).toBe("更新后的卡片工具");
  expect(registry.list()[0].executionIdentity).not.toBe(previousIdentity);
  const current = registry.capture(refreshed.toolIds);
  await manager.disconnect(config.id);
  expect(current.isCurrent()).toBe(false);
  expect(registry.list()).toHaveLength(0);
  expect(manager.list()[0].status).toBe("disconnected");
});

it("stdio 明确返回不支持，不启动进程或调用网络", async () => {
  const network = vi.fn(fetch);
  const registry = new AiToolRegistry();
  const manager = new AiMcpManager(registry, { fetch: network });
  const state = await manager.connect({
    id: "stdio",
    name: "桌面服务",
    transport: { type: "stdio", command: "node", args: ["server.js"] },
  });
  expect(state.status).toBe("unsupported_transport");
  expect(network).not.toHaveBeenCalled();
  expect(registry.list()).toHaveLength(0);
});

it("连接错误即使触发onclose也保留error状态", async () => {
  const registry = new AiToolRegistry();
  const manager = new AiMcpManager(registry, {
    fetch: async () => {
      throw new TypeError("模拟网络失败");
    },
    timeoutMs: 100,
  });
  await expect(
    manager.connect({
      id: "offline",
      name: "离线服务",
      transport: { type: "streamable-http", url: "https://validation.invalid/mcp" },
    })
  ).rejects.toMatchObject({ code: "AI_MCP_CONNECTION_FAILED" });
  expect(manager.list()[0]).toMatchObject({ id: "offline", status: "error" });
  await manager.dispose();
});

it("远端已收到调用但超时没有回执时，报告结果未知而不是可安全重试", async () => {
  const server = await serverFixture({ holdCalls: true });
  const registry = new AiToolRegistry();
  const manager = new AiMcpManager(registry, { fetch, timeoutMs: 100 });
  cleanup.push(() => manager.dispose());
  const state = await manager.connect({
    id: "held",
    name: "超时服务",
    transport: { type: "streamable-http", url: server.url },
  });
  await expect(
    registry.capture(state.toolIds).execute(state.toolIds[0], { id: 1 }, context(), {
      interactionMode: "none",
      permissionMode: "bypass",
    })
  ).rejects.toMatchObject({ code: "AI_TOOL_OUTCOME_UNKNOWN", retryable: false });
  expect(server.calls()).toBe(1);
});

it("收到明确 isError 回执时保留工具失败，不误称未知结果", async () => {
  const server = await serverFixture({ failCalls: true });
  const registry = new AiToolRegistry();
  const manager = new AiMcpManager(registry, { fetch, timeoutMs: 1000 });
  cleanup.push(() => manager.dispose());
  const state = await manager.connect({
    id: "failed",
    name: "拒绝服务",
    transport: { type: "streamable-http", url: server.url },
  });
  await expect(
    registry.capture(state.toolIds).execute(state.toolIds[0], { id: 1 }, context(), {
      interactionMode: "none",
      permissionMode: "bypass",
    })
  ).rejects.toThrow("服务端明确拒绝");
});
