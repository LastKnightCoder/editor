import { ipcMain, app, BrowserWindow } from "electron";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Module } from "../types/module";

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

interface MCPToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

class MCPConnectionManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, Transport> = new Map();
  private serverConfigs: Map<string, CustomMCPServer> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectReached: Set<string> = new Set(); // 记录已达到最大重连次数的服务器
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY_BASE = 1000;

  async connect(
    server: CustomMCPServer,
    isManualReconnect = false,
  ): Promise<void> {
    // 如果是手动重连，重置重连计数
    if (isManualReconnect) {
      this.reconnectAttempts.set(server.id, 0);
      this.maxReconnectReached.delete(server.id);
    }

    // 如果已连接，先断开
    if (this.clients.has(server.id)) {
      await this.disconnect(server.id);
    }

    this.serverConfigs.set(server.id, server);

    const transport = this.createTransport(server);
    const client = new Client(
      { name: "tau-desktop", version: app.getVersion() },
      { capabilities: {} },
    );

    // 设置自动重连（仅 stdio）
    if (server.transport.type === "stdio") {
      this.setupAutoReconnect(server.id, transport as StdioClientTransport);
    }

    try {
      await client.connect(transport);
      this.clients.set(server.id, client);
      this.transports.set(server.id, transport);
      this.reconnectAttempts.set(server.id, 0);
      console.log(`[MCP] Connected to server: ${server.name} (${server.id})`);
    } catch (error) {
      console.error(`[MCP] Failed to connect to ${server.name}:`, error);
      throw error;
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const transport = this.transports.get(serverId);

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
    console.log(`[MCP] Disconnected from server: ${serverId}`);
  }

  async disconnectAll(): Promise<void> {
    const serverIds = Array.from(this.clients.keys());
    await Promise.all(serverIds.map((id) => this.disconnect(id)));
  }

  async listTools(serverId: string): Promise<MCPToolDefinition[]> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    const result = await client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(
    serverId: string,
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<MCPToolCallResult> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args ?? {},
    });

    // 类型断言处理 SDK 返回类型
    const content = result.content as Array<{
      type: string;
      text?: string;
      data?: string;
      mimeType?: string;
    }>;

    return {
      content: content.map((item) => {
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
      return new StdioClientTransport({
        command: transport.command,
        args: transport.args,
        env: transport.env,
        cwd: transport.cwd,
      });
    } else if (transport.type === "streamable-http") {
      const url = new URL(transport.url);
      return new StreamableHTTPClientTransport(url, {
        requestInit: transport.headers
          ? { headers: transport.headers }
          : undefined,
      });
    }

    throw new Error(
      `Unsupported transport type: ${(transport as { type: string }).type}`,
    );
  }

  private setupAutoReconnect(
    serverId: string,
    transport: StdioClientTransport,
  ): void {
    transport.onclose = async () => {
      const config = this.serverConfigs.get(serverId);
      if (!config?.enabled) {
        console.log(`[MCP] Server ${serverId} disabled, not reconnecting`);
        this.notifyStatusChange(serverId, "disconnected");
        return;
      }

      // 检查是否已达到最大重连次数
      if (this.maxReconnectReached.has(serverId)) {
        console.log(
          `[MCP] Server ${serverId} already reached max reconnect attempts, waiting for manual reconnect`,
        );
        this.notifyStatusChange(
          serverId,
          "error",
          "连接失败，已达到最大重试次数。请手动重连。",
        );
        return;
      }

      const attempts = this.reconnectAttempts.get(serverId) ?? 0;
      if (attempts >= this.MAX_RECONNECT_ATTEMPTS) {
        console.error(
          `[MCP] Max reconnection attempts reached for ${serverId}`,
        );
        this.maxReconnectReached.add(serverId);
        this.notifyStatusChange(
          serverId,
          "error",
          "连接失败，已重试3次。请检查配置后手动重连。",
        );
        return;
      }

      this.reconnectAttempts.set(serverId, attempts + 1);
      const delay = this.RECONNECT_DELAY_BASE * Math.pow(2, attempts);
      console.log(
        `[MCP] Server ${serverId} disconnected, reconnecting in ${delay}ms (attempt ${attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS})`,
      );

      this.notifyStatusChange(
        serverId,
        "connecting",
        `重连中 (${attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS})`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

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
        console.error(
          `[MCP] Reconnection attempt ${attempts + 1} failed:`,
          error,
        );
        const errorMsg = error instanceof Error ? error.message : "未知错误";
        this.notifyStatusChange(
          serverId,
          "error",
          `重连失败 (${attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS}): ${errorMsg}`,
        );
        // 连接失败后，onclose 不会再次触发，所以这里需要根据次数决定是否继续
        if (attempts + 1 >= this.MAX_RECONNECT_ATTEMPTS) {
          this.maxReconnectReached.add(serverId);
          this.notifyStatusChange(
            serverId,
            "error",
            "连接失败，已重试3次。请检查配置后手动重连。",
          );
        }
      }
    };

    transport.onerror = (error) => {
      console.error(`[MCP] Transport error for ${serverId}:`, error);
      this.notifyStatusChange(serverId, "error", error.message);
    };
  }

  private notifyStatusChange(
    serverId: string,
    status: string,
    error?: string,
  ): void {
    // 向所有窗口广播连接状态变化
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send("mcp-connection-status", {
        serverId,
        status,
        error,
      });
    });
  }
}

class MCPModule implements Module {
  name = "mcp";
  private connectionManager = new MCPConnectionManager();

  async init(): Promise<void> {
    // 连接到 MCP 服务器
    ipcMain.handle(
      "mcp-connect",
      async (
        _event,
        payload: { server: CustomMCPServer; isManualReconnect?: boolean },
      ) => {
        await this.connectionManager.connect(
          payload.server,
          payload.isManualReconnect ?? false,
        );
        return { success: true };
      },
    );

    // 手动重连到 MCP 服务器
    ipcMain.handle(
      "mcp-reconnect",
      async (_event, payload: { server: CustomMCPServer }) => {
        await this.connectionManager.connect(payload.server, true);
        return { success: true };
      },
    );

    // 断开 MCP 服务器连接
    ipcMain.handle(
      "mcp-disconnect",
      async (_event, payload: { serverId: string }) => {
        await this.connectionManager.disconnect(payload.serverId);
        return { success: true };
      },
    );

    // 获取工具列表
    ipcMain.handle(
      "mcp-list-tools",
      async (_event, payload: { serverId: string }) => {
        return await this.connectionManager.listTools(payload.serverId);
      },
    );

    // 调用工具
    ipcMain.handle(
      "mcp-call-tool",
      async (
        _event,
        payload: {
          serverId: string;
          toolName: string;
          args?: Record<string, unknown>;
        },
      ) => {
        return await this.connectionManager.callTool(
          payload.serverId,
          payload.toolName,
          payload.args,
        );
      },
    );

    // 检查连接状态
    ipcMain.handle(
      "mcp-is-connected",
      async (_event, payload: { serverId: string }) => {
        return this.connectionManager.isConnected(payload.serverId);
      },
    );

    // 应用退出时断开所有连接
    app.on("before-quit", async () => {
      console.log("[MCP] Application quitting, disconnecting all servers...");
      await this.connectionManager.disconnectAll();
    });
  }
}

export default new MCPModule();
