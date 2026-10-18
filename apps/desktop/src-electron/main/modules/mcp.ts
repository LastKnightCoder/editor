import { ipcMain, app, BrowserWindow, type WebContents } from "electron";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Module } from "../types/module";
import { buildMcpSpawnEnv, resolveMcpCommand } from "../utils/mcpCommandResolver";

// 传输配置类型（与 useMCPStore 中定义保持一致）
interface StdioTransportConfig {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface StreamableHTTPTransportConfig {
  type: "streamable-http";
  url: string;
  headers?: Record<string, string>;
}

type TransportConfig = StdioTransportConfig | StreamableHTTPTransportConfig;

interface CustomMCPServer {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  transport: TransportConfig;
}

interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, object>;
    required?: string[];
  };
}

type MCPLogLevel = "info" | "ok" | "warn" | "error" | "stderr";

interface MCPLogEntry {
  time: number;
  level: MCPLogLevel;
  text: string;
}

interface MCPToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/** 每个服务器保留最近若干行日志（仅本次运行，不落盘），新行实时推送给所有窗口 */
class MCPLogBuffer {
  private readonly MAX_LINES = 200;
  private logs: Map<string, MCPLogEntry[]> = new Map();

  push(serverId: string, level: MCPLogLevel, text: string): void {
    const entry: MCPLogEntry = { time: Date.now(), level, text };
    const lines = this.logs.get(serverId) ?? [];
    lines.push(entry);
    if (lines.length > this.MAX_LINES) lines.splice(0, lines.length - this.MAX_LINES);
    this.logs.set(serverId, lines);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send("mcp-log", { serverId, entry });
    });
  }

  get(serverId: string): MCPLogEntry[] {
    return this.logs.get(serverId) ?? [];
  }

  clear(serverId: string): void {
    this.logs.delete(serverId);
  }
}

const describeTransport = (transport: TransportConfig): string =>
  transport.type === "stdio"
    ? `启动进程 ${[transport.command, ...(transport.args ?? [])].join(" ")}`
    : `连接 ${transport.url}（streamable-http）`;

class MCPConnectionManager {
  readonly logs = new MCPLogBuffer();
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, Transport> = new Map();
  private pendingClients = new Map<string, { client: Client; transport: Transport }>();
  private serverConfigs: Map<string, CustomMCPServer> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectReached: Set<string> = new Set(); // 记录已达到最大重连次数的服务器
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY_BASE = 1000;

  async connect(server: CustomMCPServer, isManualReconnect = false): Promise<void> {
    // 如果是手动重连，重置重连计数
    if (isManualReconnect) {
      this.reconnectAttempts.set(server.id, 0);
      this.maxReconnectReached.delete(server.id);
    }

    // 如果已连接，先断开
    if (this.clients.has(server.id) || this.pendingClients.has(server.id)) {
      await this.disconnect(server.id);
    }

    this.serverConfigs.set(server.id, server);

    this.logs.push(server.id, "info", describeTransport(server.transport));
    const transport = this.createTransport(server);
    const client = new Client(
      { name: "tau-desktop", version: app.getVersion() },
      { capabilities: {} }
    );
    const pending = { client, transport };
    this.pendingClients.set(server.id, pending);

    // 设置自动重连（仅 stdio）
    if (server.transport.type === "stdio") {
      this.setupAutoReconnect(server.id, transport as StdioClientTransport);
    }

    try {
      await client.connect(transport);
      if (this.serverConfigs.get(server.id) !== server) throw new Error("MCP 连接已取消");
      this.clients.set(server.id, client);
      this.transports.set(server.id, transport);
      this.reconnectAttempts.set(server.id, 0);
      console.log(`[MCP] Connected to server: ${server.name} (${server.id})`);
      this.logs.push(server.id, "ok", "连接成功");
    } catch (error) {
      console.error(`[MCP] Failed to connect to ${server.name}:`, error);
      const normalized = this.normalizeConnectionError(error);
      this.logs.push(server.id, "error", `连接失败：${normalized.message}`);
      if (this.serverConfigs.get(server.id) === server) this.serverConfigs.delete(server.id);
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      throw normalized;
    } finally {
      if (this.pendingClients.get(server.id) === pending) this.pendingClients.delete(server.id);
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const transport = this.transports.get(serverId);
    const pending = this.pendingClients.get(serverId);
    // 先撤销重连依据，再关闭传输，避免 onclose 把主动停用认作连接故障。
    this.serverConfigs.delete(serverId);
    this.pendingClients.delete(serverId);
    if (pending) {
      await pending.client.close().catch(() => undefined);
      await pending.transport.close().catch(() => undefined);
    }

    if (client) {
      try {
        await client.close();
      } catch (error) {
        console.error(`[MCP] Error closing client ${serverId}:`, error);
      }
      this.clients.delete(serverId);
    }

    if (transport) {
      try {
        await transport.close();
      } catch (error) {
        console.error(`[MCP] Error closing transport ${serverId}:`, error);
      }
      this.transports.delete(serverId);
    }

    this.serverConfigs.delete(serverId);
    this.reconnectAttempts.delete(serverId);
    this.maxReconnectReached.delete(serverId);
    if (client) this.logs.push(serverId, "info", "已断开连接");
    console.log(`[MCP] Disconnected from server: ${serverId}`);
  }

  async disconnectAll(): Promise<void> {
    const serverIds = Array.from(this.serverConfigs.keys());
    await Promise.all(serverIds.map(id => this.disconnect(id)));
  }

  async listTools(serverId: string): Promise<MCPToolDefinition[]> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    const result = await client.listTools();
    this.logs.push(serverId, "ok", `tools/list → ${result.tools.length} 个工具`);
    return result.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(
    serverId: string,
    toolName: string,
    args?: Record<string, unknown>,
    signal?: AbortSignal,
    expectedTransport?: string
  ): Promise<MCPToolCallResult> {
    if (
      expectedTransport !== undefined &&
      JSON.stringify(this.serverConfigs.get(serverId)?.transport) !== expectedTransport
    )
      throw new Error("MCP 服务配置已变化，请重新发起回答");
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    const startedAt = Date.now();
    let result: Awaited<ReturnType<Client["callTool"]>>;
    try {
      result = await client.callTool(
        {
          name: toolName,
          arguments: args ?? {},
        },
        undefined,
        { signal }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logs.push(serverId, "error", `tools/call ${toolName} 失败：${message}`);
      throw error;
    }
    this.logs.push(
      serverId,
      result.isError ? "warn" : "info",
      `tools/call ${toolName} · ${Date.now() - startedAt} ms${result.isError ? " · 返回错误" : ""}`
    );

    // 类型断言处理 SDK 返回类型
    const content = result.content as Array<{
      type: string;
      text?: string;
      data?: string;
      mimeType?: string;
    }>;

    return {
      content: content.map(item => {
        if (item.type === "text") {
          return { type: "text", text: item.text };
        } else if (item.type === "image") {
          return { type: "image", data: item.data, mimeType: item.mimeType };
        } else if (item.type === "audio") {
          return { type: "audio", data: item.data, mimeType: item.mimeType };
        }
        return { type: item.type };
      }),
      isError: result.isError as boolean | undefined,
    };
  }

  isConnected(serverId: string): boolean {
    return this.clients.has(serverId);
  }

  private createTransport(server: CustomMCPServer): Transport {
    const { transport } = server;

    if (transport.type === "stdio") {
      const env = buildMcpSpawnEnv(transport.env);
      const command = resolveMcpCommand(transport.command, env);
      const stdio = new StdioClientTransport({
        command,
        args: transport.args,
        env,
        cwd: transport.cwd,
        stderr: "pipe",
      });
      // 服务器的启动信息与报错大多走 stderr，转进日志供页面查看
      stdio.stderr?.on("data", (chunk: Buffer | string) => {
        String(chunk)
          .split(/\r?\n/)
          .filter(line => line.trim())
          .forEach(line => this.logs.push(server.id, "stderr", line));
      });
      return stdio;
    } else if (transport.type === "streamable-http") {
      const url = new URL(transport.url);
      return new StreamableHTTPClientTransport(url, {
        requestInit: transport.headers ? { headers: transport.headers } : undefined,
      });
    }

    throw new Error(`Unsupported transport type: ${(transport as { type: string }).type}`);
  }

  private setupAutoReconnect(serverId: string, transport: StdioClientTransport): void {
    transport.onclose = async () => {
      if (
        this.transports.get(serverId) !== transport &&
        this.pendingClients.get(serverId)?.transport !== transport
      )
        return;
      const config = this.serverConfigs.get(serverId);
      if (!config?.enabled) {
        console.log(`[MCP] Server ${serverId} disabled, not reconnecting`);
        this.notifyStatusChange(serverId, "disconnected");
        return;
      }

      // 检查是否已达到最大重连次数
      if (this.maxReconnectReached.has(serverId)) {
        console.log(
          `[MCP] Server ${serverId} already reached max reconnect attempts, waiting for manual reconnect`
        );
        this.notifyStatusChange(serverId, "error", "连接失败，已达到最大重试次数。请手动重连。");
        return;
      }

      const attempts = this.reconnectAttempts.get(serverId) ?? 0;
      if (attempts >= this.MAX_RECONNECT_ATTEMPTS) {
        console.error(`[MCP] Max reconnection attempts reached for ${serverId}`);
        this.maxReconnectReached.add(serverId);
        this.notifyStatusChange(serverId, "error", "连接失败，已重试3次。请检查配置后手动重连。");
        return;
      }

      this.reconnectAttempts.set(serverId, attempts + 1);
      const delay = this.RECONNECT_DELAY_BASE * Math.pow(2, attempts);
      console.log(
        `[MCP] Server ${serverId} disconnected, reconnecting in ${delay}ms (attempt ${attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS})`
      );

      this.notifyStatusChange(
        serverId,
        "connecting",
        `重连中 (${attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS})`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
      if (this.serverConfigs.get(serverId) !== config) return;

      try {
        // 清理旧连接
        this.clients.delete(serverId);
        this.transports.delete(serverId);

        // 重新连接
        await this.connect(config, false);
        this.reconnectAttempts.set(serverId, 0); // 重置计数器
        this.notifyStatusChange(serverId, "connected");
        console.log(`[MCP] Reconnected to ${serverId}`);
      } catch (error) {
        console.error(`[MCP] Reconnection attempt ${attempts + 1} failed:`, error);
        const errorMsg = error instanceof Error ? error.message : "未知错误";
        this.notifyStatusChange(
          serverId,
          "error",
          `重连失败 (${attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS}): ${errorMsg}`
        );
        // 连接失败后，onclose 不会再次触发，所以这里需要根据次数决定是否继续
        if (attempts + 1 >= this.MAX_RECONNECT_ATTEMPTS) {
          this.maxReconnectReached.add(serverId);
          this.notifyStatusChange(serverId, "error", "连接失败，已重试3次。请检查配置后手动重连。");
        }
      }
    };

    transport.onerror = error => {
      console.error(`[MCP] Transport error for ${serverId}:`, error);
      this.notifyStatusChange(serverId, "error", error.message);
    };
  }

  private notifyStatusChange(serverId: string, status: string, error?: string): void {
    if (status === "connecting" && error) this.logs.push(serverId, "warn", error);
    else if (status === "error" && error) this.logs.push(serverId, "error", error);
    // 向所有窗口广播连接状态变化
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send("mcp-connection-status", {
        serverId,
        status,
        error,
      });
    });
  }

  private normalizeConnectionError(error: unknown): Error {
    if (error instanceof Error && /spawn\s+\S+\s+ENOENT/i.test(error.message)) {
      const command = error.message.match(/spawn\s+(\S+)\s+ENOENT/i)?.[1];
      return new Error(
        command
          ? `未找到可执行命令 "${command}"。请检查 PATH 配置，或在 MCP 服务配置中填写绝对路径。`
          : "未找到 MCP 本地服务所需的可执行命令。请检查 PATH 配置或改用绝对路径。"
      );
    }

    return error instanceof Error ? error : new Error("未知错误");
  }
}

class MCPModule implements Module {
  name = "mcp";
  private connectionManager = new MCPConnectionManager();
  private windowConnections = new Map<WebContents, Set<string>>();

  private trackWindow(sender: WebContents, serverId: string): void {
    let connections = this.windowConnections.get(sender);
    if (!connections) {
      connections = new Set();
      this.windowConnections.set(sender, connections);
      const close = () => {
        const ids = this.windowConnections.get(sender);
        this.windowConnections.delete(sender);
        sender.removeListener("destroyed", close);
        sender.removeListener("render-process-gone", close);
        sender.removeListener("did-navigate", close);
        for (const id of ids ?? []) void this.connectionManager.disconnect(id);
      };
      sender.once("destroyed", close);
      sender.once("render-process-gone", close);
      sender.once("did-navigate", close);
    }
    connections.add(serverId);
  }

  async init(): Promise<void> {
    // 连接到 MCP 服务器
    ipcMain.handle(
      "mcp-connect",
      async (
        event,
        payload: { server: CustomMCPServer; isManualReconnect?: boolean; windowScoped?: boolean }
      ) => {
        if (payload.windowScoped) this.trackWindow(event.sender, payload.server.id);
        await this.connectionManager.connect(payload.server, payload.isManualReconnect ?? false);
        return { success: true };
      }
    );

    // 手动重连到 MCP 服务器
    ipcMain.handle("mcp-reconnect", async (_event, payload: { server: CustomMCPServer }) => {
      await this.connectionManager.connect(payload.server, true);
      return { success: true };
    });

    // 断开 MCP 服务器连接
    ipcMain.handle("mcp-disconnect", async (_event, payload: { serverId: string }) => {
      for (const connections of this.windowConnections.values())
        connections.delete(payload.serverId);
      await this.connectionManager.disconnect(payload.serverId);
      return { success: true };
    });

    // 获取工具列表
    ipcMain.handle("mcp-list-tools", async (_event, payload: { serverId: string }) => {
      return await this.connectionManager.listTools(payload.serverId);
    });

    // 调用工具
    const toolCalls = new Map<string, AbortController>();
    ipcMain.handle("mcp-cancel-tool", (event, { requestId }: { requestId: string }) => {
      toolCalls.get(`${event.sender.id}:${requestId}`)?.abort();
    });
    ipcMain.handle(
      "mcp-call-tool",
      async (
        event,
        payload: {
          serverId: string;
          toolName: string;
          args?: Record<string, unknown>;
          requestId?: string;
          expectedTransport?: string;
        }
      ) => {
        const key = `${event.sender.id}:${payload.requestId ?? crypto.randomUUID()}`;
        const controller = new AbortController();
        toolCalls.set(key, controller);
        const cancel = () => controller.abort();
        event.sender.once("destroyed", cancel);
        event.sender.once("render-process-gone", cancel);
        event.sender.once("did-navigate", cancel);
        try {
          return await this.connectionManager.callTool(
            payload.serverId,
            payload.toolName,
            payload.args,
            controller.signal,
            payload.expectedTransport
          );
        } finally {
          toolCalls.delete(key);
          event.sender.removeListener("destroyed", cancel);
          event.sender.removeListener("render-process-gone", cancel);
          event.sender.removeListener("did-navigate", cancel);
        }
      }
    );

    ipcMain.handle("mcp-get-logs", async (_event, payload: { serverId: string }) => {
      return this.connectionManager.logs.get(payload.serverId);
    });

    ipcMain.handle("mcp-clear-logs", async (_event, payload: { serverId: string }) => {
      this.connectionManager.logs.clear(payload.serverId);
      return { success: true };
    });

    // 检查连接状态
    ipcMain.handle("mcp-is-connected", async (_event, payload: { serverId: string }) => {
      return this.connectionManager.isConnected(payload.serverId);
    });
  }

  /** 受控退出时由退出协调器调用，断开所有 MCP 连接 */
  async disconnectAll(): Promise<void> {
    console.log("[MCP] Disconnecting all servers...");
    await this.connectionManager.disconnectAll();
  }
}

export default new MCPModule();
