import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { AiError, type AiToolExecutionContext } from "../contracts";
import { AiToolRegistry } from "../tools";

export interface AiMcpServerConfig {
  id: string;
  name: string;
  transport:
    | { type: "streamable-http"; url: string; headers?: Record<string, string> }
    | {
        type: "stdio";
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
      };
}
export interface AiMcpServerState {
  id: string;
  name: string;
  status: "connecting" | "connected" | "disconnected" | "error" | "unsupported_transport";
  generation?: string;
  toolIds: readonly string[];
  error?: string;
}
type Connection = {
  config: AiMcpServerConfig;
  client: Client;
  transport: StreamableHTTPClientTransport;
  generation: string;
  tools: Array<() => void>;
  revision: number;
};

async function modelToolName(serverId: string, toolName: string) {
  const raw = `mcp_${serverId}__${toolName}`;
  if (/^[A-Za-z0-9_-]{1,64}$/.test(raw)) return raw;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([serverId, toolName]))
  );
  const suffix = [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  return `${raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 47)}_${suffix}`;
}

export class AiMcpManager {
  private readonly connections = new Map<string, Connection>();
  private readonly states = new Map<string, AiMcpServerState>();
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(
    private readonly registry: AiToolRegistry,
    private readonly options: {
      fetch: typeof globalThis.fetch;
      fetchForServer?: (config: AiMcpServerConfig) => typeof globalThis.fetch;
      validateContext?: (
        config: AiMcpServerConfig,
        context: AiToolExecutionContext
      ) => void | Promise<void>;
      clientName?: string;
      clientVersion?: string;
      timeoutMs?: number;
    }
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(state: AiMcpServerState) {
    this.states.set(state.id, state);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* 观察者失败不改变连接事实。 */
      }
    }
  }

  list(): readonly AiMcpServerState[] {
    return [...this.states.values()].map(state => structuredClone(state));
  }

  private current(connection: Connection) {
    return this.connections.get(connection.config.id) === connection;
  }

  private revoke(connection: Connection) {
    for (const dispose of connection.tools.splice(0)) dispose();
  }

  async connect(input: AiMcpServerConfig): Promise<AiMcpServerState> {
    if (this.disposed) throw new AiError("AI_MCP_CONNECTION_FAILED", "MCP 管理器已释放");
    if (!input.id || !input.name)
      throw new AiError("AI_MCP_CONNECTION_FAILED", "MCP 配置必须声明身份与名称");
    const previous = this.connections.get(input.id);
    if (previous) {
      this.connections.delete(input.id);
      this.revoke(previous);
      void previous.client.close().catch(() => undefined);
    }
    if (input.transport.type !== "streamable-http") {
      const state: AiMcpServerState = {
        id: input.id,
        name: input.name,
        status: "unsupported_transport",
        toolIds: [],
        error: "手机不支持启动 stdio MCP 进程",
      };
      this.publish(state);
      return structuredClone(state);
    }
    const config = structuredClone(input);
    const url = new URL(input.transport.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new AiError("AI_MCP_CONNECTION_FAILED", "MCP 需要不含 URL 用户凭据的 HTTP(S) 地址");
    const client = new Client(
      {
        name: this.options.clientName ?? "tau-mobile",
        version: this.options.clientVersion ?? "0.1.0",
      },
      { capabilities: {} }
    );
    const transport = new StreamableHTTPClientTransport(url, {
      fetch: this.options.fetchForServer?.(config) ?? this.options.fetch,
      requestInit: input.transport.headers
        ? { headers: structuredClone(input.transport.headers) }
        : undefined,
      reconnectionOptions: {
        initialReconnectionDelay: 1000,
        maxReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1,
        maxRetries: 0,
      },
    });
    const connection: Connection = {
      config,
      client,
      transport,
      generation: crypto.randomUUID(),
      tools: [],
      revision: 0,
    };
    this.connections.set(config.id, connection);
    this.publish({
      id: config.id,
      name: config.name,
      status: "connecting",
      generation: connection.generation,
      toolIds: [],
    });
    client.onclose = () => {
      if (!this.current(connection)) return;
      this.connections.delete(config.id);
      this.revoke(connection);
      this.publish({
        id: config.id,
        name: config.name,
        status: "disconnected",
        generation: connection.generation,
        toolIds: [],
      });
    };
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      if (!this.current(connection)) return;
      try {
        await this.refreshTools(config.id);
      } catch {
        /* refreshTools 已撤销失效工具并发布错误。 */
      }
    });
    try {
      await client.connect(transport, { timeout: this.options.timeoutMs ?? 60_000 });
      if (!this.current(connection))
        throw new AiError("AI_MCP_CONNECTION_FAILED", "MCP 连接已取消");
      return await this.refreshTools(config.id);
    } catch (error) {
      if (this.current(connection)) {
        this.connections.delete(config.id);
        this.revoke(connection);
      }
      if (this.states.get(config.id)?.generation === connection.generation) {
        this.publish({
          id: config.id,
          name: config.name,
          status: "error",
          generation: connection.generation,
          toolIds: [],
          error: "MCP 连接失败",
        });
      }
      await client.close().catch(() => undefined);
      if (error instanceof AiError) throw error;
      throw new AiError("AI_MCP_CONNECTION_FAILED", "MCP 连接或工具发现失败", true);
    }
  }

  async refreshTools(id: string): Promise<AiMcpServerState> {
    const connection = this.connections.get(id);
    if (!connection) throw new AiError("AI_MCP_CONNECTION_FAILED", "MCP 尚未连接");
    const toolIds: string[] = [];
    const discovered: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    try {
      do {
        const page = await connection.client.listTools(cursor ? { cursor } : undefined, {
          timeout: this.options.timeoutMs ?? 60_000,
        });
        if (!this.current(connection))
          throw new AiError("AI_MCP_CONNECTION_FAILED", "MCP 连接已变化");
        discovered.push(...page.tools);
        cursor = page.nextCursor;
        if (cursor && cursors.has(cursor))
          throw new AiError("AI_MCP_CONNECTION_FAILED", "MCP 工具分页游标重复");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      const definitions = await Promise.all(
        discovered.map(async tool => ({ tool, name: await modelToolName(id, tool.name) }))
      );
      if (!this.current(connection))
        throw new AiError("AI_MCP_CONNECTION_FAILED", "MCP 连接已变化");
      this.revoke(connection);
      const revision = ++connection.revision;
      for (const { tool, name } of definitions) {
        const toolId = `mcp:${JSON.stringify([id, tool.name])}`;
        const dispose = this.registry.register(
          {
            id: toolId,
            name,
            description: tool.description ?? tool.name,
            inputSchema: structuredClone(tool.inputSchema),
            risk: "execute",
            sourceId: `mcp:${id}`,
            executionIdentity: `${connection.generation}:${revision}`,
          },
          async (args, context) => {
            await this.options.validateContext?.(connection.config, context);
            if (!this.current(connection))
              throw new AiError("AI_TOOL_UNAVAILABLE", "MCP 连接已失效");
            let result: Awaited<ReturnType<Client["callTool"]>>;
            try {
              result = await connection.client.callTool(
                { name: tool.name, arguments: args as Record<string, unknown> },
                undefined,
                { signal: context.signal, timeout: this.options.timeoutMs ?? 60_000 }
              );
            } catch {
              // 远端可能已提交副作用；未获得可用回执不能推断为未执行。
              throw new AiError(
                "AI_TOOL_OUTCOME_UNKNOWN",
                "MCP 工具未获得执行回执，结果未知，不能自动重放",
                false,
                { serverId: id, toolName: tool.name }
              );
            }
            await this.options.validateContext?.(connection.config, context);
            if (!this.current(connection))
              throw new AiError("AI_TOOL_UNAVAILABLE", "MCP 连接已失效");
            const content: unknown[] = Array.isArray(result.content) ? result.content : [];
            const text = content
              .filter(
                (block): block is { type: "text"; text: string } =>
                  !!block &&
                  typeof block === "object" &&
                  (block as { type?: unknown }).type === "text" &&
                  typeof (block as { text?: unknown }).text === "string"
              )
              .map(block => block.text)
              .join("\n");
            if (result.isError) throw new Error(text || "MCP 工具执行失败");
            return {
              content: text || JSON.stringify(content),
              metadata: {
                mcp: {
                  serverId: id,
                  toolName: tool.name,
                  content,
                  ...(result.structuredContent
                    ? { structuredContent: result.structuredContent }
                    : {}),
                },
              },
            };
          }
        );
        connection.tools.push(dispose);
        toolIds.push(toolId);
      }
      const state: AiMcpServerState = {
        id,
        name: connection.config.name,
        generation: connection.generation,
        status: "connected",
        toolIds,
      };
      this.publish(state);
      return structuredClone(state);
    } catch (error) {
      if (this.current(connection)) {
        this.revoke(connection);
        this.publish({
          id,
          name: connection.config.name,
          status: "error",
          generation: connection.generation,
          toolIds: [],
          error: "MCP 工具刷新失败",
        });
      }
      throw error;
    }
  }

  async disconnect(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (connection) {
      this.connections.delete(id);
      this.revoke(connection);
      this.publish({ id, name: connection.config.name, status: "disconnected", toolIds: [] });
      await connection.client.close();
    } else {
      const state = this.states.get(id);
      if (state) this.publish({ id, name: state.name, status: "disconnected", toolIds: [] });
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await Promise.all([...this.connections.keys()].map(id => this.disconnect(id)));
    this.listeners.clear();
  }
}
