import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MCP_PROVIDERS } from "@/mcp/providers";
import { v4 as uuid } from "uuid";
import type { ToolJsonSchema } from "@/types";

interface ProviderToggleState {
  enabled: boolean;
}

export interface StdioTransportConfig {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface StreamableHTTPTransportConfig {
  type: "streamable-http";
  url: string;
  headers?: Record<string, string>;
}

export type TransportConfig = StdioTransportConfig | StreamableHTTPTransportConfig;

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface CustomMCPServer {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  transport: TransportConfig;
}

// 旧版服务器格式（用于迁移）
interface LegacyCustomMCPServer {
  id: string;
  name: string;
  baseUrl: string;
  description?: string;
  apiKey?: string;
  enabled: boolean;
}

/** 服务器实际提供的工具（连接成功后由 tools/list 得到，仅用于展示） */
export interface MCPServerToolInfo {
  name: string;
  description?: string;
  parameters?: ToolJsonSchema;
}

interface MCPStoreState {
  providerStates: Record<string, ProviderToggleState>;
  customServers: CustomMCPServer[];
  connectionStatus: Record<string, ConnectionStatus>;
  connectionErrors: Record<string, string>;
  /** 逐工具停用：来源 id（内置 provider id 或自定义服务器 id）→ 停用的工具名 */
  disabledTools: Record<string, string[]>;
  serverTools: Record<string, MCPServerToolInfo[]>;
  setToolsEnabled: (sourceId: string, toolNames: string[], enabled: boolean) => void;
  setServerTools: (serverId: string, tools: MCPServerToolInfo[]) => void;
  setProviderEnabled: (id: string, enabled: boolean) => void;
  isProviderEnabled: (id: string) => boolean;
  addCustomServer: (payload: {
    name: string;
    description?: string;
    transport: TransportConfig;
  }) => CustomMCPServer;
  updateCustomServer: (
    id: string,
    payload: {
      name?: string;
      description?: string;
      transport?: TransportConfig;
    }
  ) => void;
  removeCustomServer: (id: string) => void;
  setCustomServerEnabled: (id: string, enabled: boolean) => void;
  getCustomServer: (id: string) => CustomMCPServer | undefined;
  setConnectionStatus: (id: string, status: ConnectionStatus, error?: string) => void;
  clearConnectionStatus: (id: string) => void;
}

const createDefaultStates = (): Record<string, ProviderToggleState> => {
  return MCP_PROVIDERS.reduce(
    (acc, provider) => {
      acc[provider.id] = {
        enabled: provider.defaultEnabled ?? false,
      };
      return acc;
    },
    {} as Record<string, ProviderToggleState>
  );
};

// 迁移旧的 provider 状态
const migrateProviderStates = (
  states: Record<string, ProviderToggleState>
): Record<string, ProviderToggleState> => {
  const migrated = { ...states };

  // 确保所有新的 providers 都有默认状态
  const defaultStates = createDefaultStates();
  Object.keys(defaultStates).forEach(id => {
    if (!(id in migrated)) {
      migrated[id] = defaultStates[id];
    }
  });

  return migrated;
};

// 检查是否为旧版服务器格式
const isLegacyServer = (server: unknown): server is LegacyCustomMCPServer => {
  return (
    typeof server === "object" &&
    server !== null &&
    "baseUrl" in server &&
    typeof (server as LegacyCustomMCPServer).baseUrl === "string" &&
    !("transport" in server)
  );
};

// 迁移旧版自定义服务器到新格式
const migrateCustomServers = (servers: unknown[]): CustomMCPServer[] => {
  return servers.map(server => {
    if (isLegacyServer(server)) {
      // 将旧的 baseUrl + apiKey 格式转换为 streamable-http 传输
      const headers: Record<string, string> = {};
      if (server.apiKey) {
        headers["Authorization"] = `Bearer ${server.apiKey}`;
      }

      return {
        id: server.id,
        name: server.name,
        description: server.description,
        enabled: server.enabled,
        transport: {
          type: "streamable-http" as const,
          url: server.baseUrl,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        },
      };
    }
    // 已经是新格式
    return server as CustomMCPServer;
  });
};

const useMCPStore = create<MCPStoreState>()(
  persist(
    (set, get) => ({
      providerStates: createDefaultStates(),
      customServers: [],
      connectionStatus: {},
      connectionErrors: {},
      disabledTools: {},
      serverTools: {},
      setToolsEnabled: (sourceId, toolNames, enabled) =>
        set(state => {
          const current = new Set(state.disabledTools[sourceId] ?? []);
          toolNames.forEach(name => (enabled ? current.delete(name) : current.add(name)));
          const next = { ...state.disabledTools };
          if (current.size > 0) next[sourceId] = [...current];
          else delete next[sourceId];
          return { disabledTools: next };
        }),
      setServerTools: (serverId, tools) =>
        set(state => ({ serverTools: { ...state.serverTools, [serverId]: tools } })),
      setProviderEnabled: (id, enabled) =>
        set(state => ({
          providerStates: {
            ...state.providerStates,
            [id]: { enabled },
          },
        })),
      isProviderEnabled: (id: string) => {
        const local = get().providerStates[id];
        if (typeof local?.enabled === "boolean") {
          return local.enabled;
        }
        const definition = MCP_PROVIDERS.find(provider => provider.id === id);
        return definition?.defaultEnabled ?? false;
      },
      addCustomServer: payload => {
        const server: CustomMCPServer = {
          id: uuid(),
          name: payload.name.trim(),
          description: payload.description?.trim(),
          enabled: true,
          transport: payload.transport,
        };
        set(state => ({
          customServers: [...state.customServers, server],
        }));
        return server;
      },
      updateCustomServer: (id, payload) =>
        set(state => ({
          customServers: state.customServers.map(server =>
            server.id === id
              ? {
                  ...server,
                  name: payload.name !== undefined ? payload.name.trim() : server.name,
                  description:
                    payload.description !== undefined
                      ? payload.description?.trim()
                      : server.description,
                  transport: payload.transport !== undefined ? payload.transport : server.transport,
                }
              : server
          ),
        })),
      removeCustomServer: id =>
        set(state => ({
          customServers: state.customServers.filter(server => server.id !== id),
          disabledTools: Object.fromEntries(
            Object.entries(state.disabledTools).filter(([key]) => key !== id)
          ),
          serverTools: Object.fromEntries(
            Object.entries(state.serverTools).filter(([key]) => key !== id)
          ),
          connectionStatus: Object.fromEntries(
            Object.entries(state.connectionStatus).filter(([key]) => key !== id)
          ),
          connectionErrors: Object.fromEntries(
            Object.entries(state.connectionErrors).filter(([key]) => key !== id)
          ),
        })),
      setCustomServerEnabled: (id, enabled) =>
        set(state => ({
          customServers: state.customServers.map(server =>
            server.id === id ? { ...server, enabled } : server
          ),
        })),
      getCustomServer: (id: string) => {
        return get().customServers.find(server => server.id === id);
      },
      setConnectionStatus: (id, status, error) =>
        set(state => ({
          connectionStatus: {
            ...state.connectionStatus,
            [id]: status,
          },
          connectionErrors: error
            ? { ...state.connectionErrors, [id]: error }
            : Object.fromEntries(
                Object.entries(state.connectionErrors).filter(([key]) => key !== id)
              ),
        })),
      clearConnectionStatus: id =>
        set(state => ({
          connectionStatus: Object.fromEntries(
            Object.entries(state.connectionStatus).filter(([key]) => key !== id)
          ),
          connectionErrors: Object.fromEntries(
            Object.entries(state.connectionErrors).filter(([key]) => key !== id)
          ),
        })),
    }),
    {
      name: "mcp-store",
      partialize: state => ({
        providerStates: state.providerStates,
        customServers: state.customServers,
        disabledTools: state.disabledTools,
      }),
      onRehydrateStorage: () => state => {
        if (state) {
          // 执行 provider 状态迁移
          state.providerStates = migrateProviderStates(state.providerStates);
          // 执行自定义服务器迁移
          state.customServers = migrateCustomServers(state.customServers);
        }
      },
    }
  )
);

export default useMCPStore;
