import { invoke, on, off } from "@/electron";
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolJsonSchema,
} from "@/types";
import type { CustomMCPServer, ConnectionStatus } from "@/stores/useMCPStore";

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
  await invoke("mcp-connect", { server });
  console.debug("[MCP] Connected to server", { server: server.name });
};

/**
 * 断开 MCP 服务器连接
 */
export const disconnectFromServer = async (serverId: string): Promise<void> => {
  await invoke("mcp-disconnect", { serverId });
  console.debug("[MCP] Disconnected from server", { serverId });
};

/**
 * 检查服务器是否已连接
 */
export const isServerConnected = async (serverId: string): Promise<boolean> => {
  return (await invoke("mcp-is-connected", { serverId })) as boolean;
};

/**
 * 获取服务器的工具列表
 */
const listServerTools = async (serverId: string): Promise<MCPToolDefinition[]> => {
  const tools = (await invoke("mcp-list-tools", { serverId })) as MCPToolDefinition[];
  console.debug("[MCP] Listed tools", {
    serverId,
    count: tools.length,
    toolNames: tools.map((t) => t.name),
  });
  return tools;
};

/**
 * 调用服务器的工具
 */
const callServerTool = async (
  serverId: string,
  toolName: string,
  args?: Record<string, unknown>,
): Promise<MCPToolCallResult> => {
  console.debug("[MCP] Calling tool", { serverId, toolName, args });
  const result = (await invoke("mcp-call-tool", {
    serverId,
    toolName,
    args,
  })) as MCPToolCallResult;
  console.debug("[MCP] Tool result", { serverId, toolName, result });
  return result;
};

/**
 * 解析 MCP 工具调用结果为 ToolExecutionResult
 */
const parseToolResult = (result: MCPToolCallResult): ToolExecutionResult => {
  // 提取所有文本内容
  const textContents = result.content
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text!)
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
  const nonTextContents = result.content.filter((item) => item.type !== "text");
  if (nonTextContents.length > 0) {
    return {
      content: JSON.stringify(nonTextContents),
      metadata: { contentTypes: nonTextContents.map((c) => c.type) },
    };
  }

  return { content: "" };
};

/**
 * 从服务器获取工具定义并包装为 ToolDefinition
 */
export const fetchToolsFromServer = async (
  server: CustomMCPServer,
): Promise<ToolDefinition[]> => {
  // 确保已连接
  const connected = await isServerConnected(server.id);
  if (!connected) {
    await connectToServer(server);
  }

  const remoteTools = await listServerTools(server.id);

  return remoteTools.map((tool) => ({
    name: tool.name,
    description: tool.description || "",
    parameters: tool.inputSchema,
    executor: async (args) => {
      const result = await callServerTool(server.id, tool.name, args ?? {});
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
export const onConnectionStatusChange = (
  listener: MCPConnectionStatusListener,
): (() => void) => {
  const handler = (_event: unknown, data: {
    serverId: string;
    status: ConnectionStatus;
    error?: string;
  }) => {
    listener(data);
  };

  on("mcp-connection-status", handler);

  // 返回取消监听的函数
  return () => {
    off("mcp-connection-status", handler);
  };
};
