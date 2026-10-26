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

/** 服务器实际提供的工具（连接成功后由 tools/list 得到，仅用于展示） */
export interface MCPServerToolInfo {
  name: string;
  displayName?: string;
  description?: string;
  parameters?: ToolJsonSchema;
}

interface MCPStoreState {
  providerStates: Record<string, ProviderToggleState>;
  customServers: CustomMCPServer[];
  pluginTransports: Record<string, TransportConfig>;
  setPluginTransport: (id: string, transport: TransportConfig) => void;
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

const useMCPStore = create<MCPStoreState>()(
  persist(
    (set, get) => ({
      providerStates: createDefaultStates(),
      customServers: [],
      pluginTransports: {},
      setPluginTransport: (id, transport) =>
        set(state => ({ pluginTransports: { ...state.pluginTransports, [id]: transport } })),
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
        pluginTransports: state.pluginTransports,
        disabledTools: state.disabledTools,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<MCPStoreState> | undefined;
        const servers = saved?.customServers ?? [];
        if (
          !Array.isArray(servers) ||
          servers.some(server => {
            const transport = server?.transport;
            return (
              !transport ||
              (transport.type === "stdio"
                ? typeof transport.command !== "string" || !transport.command.trim()
                : transport.type !== "streamable-http" ||
                  typeof transport.url !== "string" ||
                  !transport.url.trim())
            );
          })
        )
          throw new Error("MCP 服务器配置格式不受支持，请使用当前传输配置");
        return {
          ...current,
          ...saved,
          providerStates: { ...createDefaultStates(), ...saved?.providerStates },
          customServers: servers,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.error("MCP 配置读取失败，原存储保留", error);
      },
    }
  )
);

export default useMCPStore;
