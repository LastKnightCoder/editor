import { on, off } from "@/electron";
import {
  callMcpTool,
  connectMcpServer,
  disconnectMcpServer,
  ensureModule,
  isMcpServerConnected,
  listMcpServerTools,
  reconnectMcpServer,
} from "@/commands";
import type { ToolDefinition, ToolExecutionResult, ToolJsonSchema } from "@/types";
import type { CustomMCPServer, ConnectionStatus } from "@/stores/useMCPStore";
import useMCPStore from "@/stores/useMCPStore";

interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: ToolJsonSchema;
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

/**
 * 连接到 MCP 服务器
 */
export const connectToServer = async (server: CustomMCPServer): Promise<void> => {
  await connectMcpServer(server);
  console.debug("[MCP] Connected to server", { server: server.name });
};

/**
 * 手动重连到 MCP 服务器（重置重连计数）
 */
export const reconnectToServer = async (server: CustomMCPServer): Promise<void> => {
  await reconnectMcpServer(server);
  console.debug("[MCP] Manually reconnected to server", {
    server: server.name,
  });
};

/**
 * 断开 MCP 服务器连接
 */
export const disconnectFromServer = async (serverId: string): Promise<void> => {
  await disconnectMcpServer(serverId);
  console.debug("[MCP] Disconnected from server", { serverId });
};

/**
 * 检查服务器是否已连接
 */
export const isServerConnected = async (serverId: string): Promise<boolean> => {
  return await isMcpServerConnected(serverId);
};

/**
 * 获取服务器的工具列表
 */
const listServerTools = async (serverId: string): Promise<MCPToolDefinition[]> => {
  const tools = await listMcpServerTools<MCPToolDefinition>({ serverId });
  console.debug("[MCP] Listed tools", {
    serverId,
    count: tools.length,
    toolNames: tools.map(t => t.name),
  });
  return tools;
};

/**
 * 调用服务器的工具
 */
const callServerTool = async (
  serverId: string,
  toolName: string,
  args?: Record<string, unknown>
): Promise<MCPToolCallResult> => {
  console.debug("[MCP] Calling tool", { serverId, toolName, args });
  const result = await callMcpTool<MCPToolCallResult>({ serverId, toolName, args });
  console.debug("[MCP] Tool result", { serverId, toolName, result });
  return result;
};

/**
 * 解析 MCP 工具调用结果为 ToolExecutionResult
 */
const parseToolResult = (result: MCPToolCallResult): ToolExecutionResult => {
  // 提取所有文本内容
  const textContents = result.content
    .filter(item => item.type === "text" && item.text)
    .map(item => item.text!)
    .join("\n");

  // 如果是错误，返回错误格式
  if (result.isError) {
    return {
      content: textContents || "Tool execution failed",
      metadata: { isError: true },
    };
  }

  // 尝试解析 JSON
  if (textContents) {
    try {
      const parsed = JSON.parse(textContents);
      if (typeof parsed === "object" && parsed !== null && "content" in parsed) {
        return parsed as ToolExecutionResult;
      }
      return { content: textContents };
    } catch {
      return { content: textContents };
    }
  }

  // 处理其他内容类型（如图片）
  const nonTextContents = result.content.filter(item => item.type !== "text");
  if (nonTextContents.length > 0) {
    return {
      content: JSON.stringify(nonTextContents),
      metadata: { contentTypes: nonTextContents.map(c => c.type) },
    };
  }

  return { content: "" };
};

/**
 * 确保 MCP 模块已初始化
 */
const ensureMCPModuleInitialized = (): Promise<void> =>
  ensureModule("mcp").catch((error: unknown) => {
    console.error("[MCP] 初始化 MCP 模块失败:", error);
    throw error;
  });

/**
 * 从服务器获取工具定义并包装为 ToolDefinition
 */
export const fetchToolsFromServer = async (server: CustomMCPServer): Promise<ToolDefinition[]> => {
  // 确保 MCP 模块已初始化
  await ensureMCPModuleInitialized();

  // 确保已连接
  const connected = await isServerConnected(server.id);
  if (!connected) {
    await connectToServer(server);
  }

  const remoteTools = await listServerTools(server.id);

  return remoteTools.map(tool => ({
    name: tool.name,
    description: tool.description || "",
    parameters: tool.inputSchema,
    // 远端工具无法由本地确认副作用，默认按执行级别审批。
    risk: "execute",
    executor: async args => {
      // 从 store 获取最新的服务器配置
      const currentServer = useMCPStore.getState().getCustomServer(server.id);
      if (!currentServer) {
        throw new Error(`MCP 服务器 "${server.name}" 已被删除`);
      }

      if (!currentServer.enabled) {
        throw new Error(`MCP 服务器 "${currentServer.name}" 已被禁用`);
      }

      // 确保服务器已连接
      const connected = await isServerConnected(currentServer.id);
      if (!connected) {
        console.log(`[MCP] 服务器 ${currentServer.name} 未连接，尝试重新连接...`);
        try {
          await connectToServer(currentServer);
        } catch (error) {
          console.error(`[MCP] 重新连接失败:`, error);
          throw new Error(
            `MCP 服务器 "${currentServer.name}" 未连接。${error instanceof Error ? error.message : ""}`
          );
        }
      }

      const result = await callServerTool(currentServer.id, tool.name, args ?? {});
      return parseToolResult(result);
    },
  }));
};

/**
 * MCP 连接状态事件监听器类型
 */
type MCPConnectionStatusListener = (data: {
  serverId: string;
  status: ConnectionStatus;
  error?: string;
}) => void;

/**
 * 注册 MCP 连接状态变化监听器
 */
export const onConnectionStatusChange = (listener: MCPConnectionStatusListener): (() => void) => {
  const handler = (
    _event: unknown,
    data: {
      serverId: string;
      status: ConnectionStatus;
      error?: string;
    }
  ) => {
    listener(data);
  };

  on("mcp-connection-status", handler);

  // 返回取消监听的函数
  return () => {
    off("mcp-connection-status", handler);
  };
};
