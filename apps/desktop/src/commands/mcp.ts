import { invoke } from "@/electron";
import type { CustomMCPServer, ConnectionStatus } from "@/stores/useMCPStore";

export async function connectMcpServer(server: CustomMCPServer): Promise<void> {
  await invoke("mcp-connect", { server });
}

export async function reconnectMcpServer(server: CustomMCPServer): Promise<void> {
  await invoke("mcp-reconnect", { server });
}

export async function disconnectMcpServer(serverId: string): Promise<void> {
  await invoke("mcp-disconnect", { serverId });
}

export async function isMcpServerConnected(serverId: string): Promise<boolean> {
  return invoke("mcp-is-connected", { serverId });
}

export async function getMcpConnectionStatus(serverId: string): Promise<ConnectionStatus> {
  return invoke("mcp-connection-status", { serverId });
}

export async function listMcpServerTools<T = unknown>(payload: { serverId: string }): Promise<T[]> {
  return invoke("mcp-list-tools", payload);
}

export async function callMcpTool<T = unknown>(payload: {
  serverId: string;
  toolName: string;
  args?: Record<string, unknown>;
}): Promise<T> {
  return invoke("mcp-call-tool", payload);
}

export type McpLogLevel = "info" | "ok" | "warn" | "error" | "stderr";

export interface McpLogEntry {
  time: number;
  level: McpLogLevel;
  text: string;
}

export async function getMcpServerLogs(serverId: string): Promise<McpLogEntry[]> {
  return invoke("mcp-get-logs", { serverId });
}

export async function clearMcpServerLogs(serverId: string): Promise<void> {
  await invoke("mcp-clear-logs", { serverId });
}
