import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MCP_PROVIDERS } from "@/mcp/providers";
import { v4 as uuid } from "uuid";

interface ProviderToggleState {
  enabled: boolean;
}

export interface CustomMCPServer {
  id: string;
  name: string;
  baseUrl: string;
  description?: string;
  apiKey?: string;
  enabled: boolean;
}

interface MCPStoreState {
  providerStates: Record<string, ProviderToggleState>;
  customServers: CustomMCPServer[];
  setProviderEnabled: (id: string, enabled: boolean) => void;
  isProviderEnabled: (id: string) => boolean;
  addCustomServer: (payload: {
    name: string;
    baseUrl: string;
    description?: string;
    apiKey?: string;
  }) => CustomMCPServer;
  updateCustomServer: (
    id: string,
    payload: {
      name?: string;
      baseUrl?: string;
      description?: string;
      apiKey?: string;
    },
  ) => void;
  removeCustomServer: (id: string) => void;
  setCustomServerEnabled: (id: string, enabled: boolean) => void;
  getCustomServer: (id: string) => CustomMCPServer | undefined;
}

const createDefaultStates = (): Record<string, ProviderToggleState> => {
  return MCP_PROVIDERS.reduce(
    (acc, provider) => {
      acc[provider.id] = {
        enabled: provider.defaultEnabled ?? false,
      };
      return acc;
    },
    {} as Record<string, ProviderToggleState>,
  );
};

// 迁移旧的 provider 状态
const migrateProviderStates = (
  states: Record<string, ProviderToggleState>,
): Record<string, ProviderToggleState> => {
  const migrated = { ...states };

  // 如果存在旧的 card-statistics，迁移到 card-tools
  if ("card-statistics" in migrated) {
    migrated["card-tools"] = migrated["card-statistics"];
    delete migrated["card-statistics"];
  }

  // 确保所有新的 providers 都有默认状态
  const defaultStates = createDefaultStates();
  Object.keys(defaultStates).forEach((id) => {
    if (!(id in migrated)) {
      migrated[id] = defaultStates[id];
    }
  });

  return migrated;
};

const useMCPStore = create<MCPStoreState>()(
  persist(
    (set, get) => ({
      providerStates: createDefaultStates(),
      customServers: [],
      setProviderEnabled: (id, enabled) =>
        set((state) => ({
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
        const definition = MCP_PROVIDERS.find((provider) => provider.id === id);
        return definition?.defaultEnabled ?? false;
      },
      addCustomServer: (payload) => {
        const server: CustomMCPServer = {
          id: uuid(),
          name: payload.name.trim(),
          baseUrl: payload.baseUrl.trim(),
          description: payload.description?.trim(),
          apiKey: payload.apiKey?.trim(),
          enabled: true,
        };
        set((state) => ({
          customServers: [...state.customServers, server],
        }));
        return server;
      },
      updateCustomServer: (id, payload) =>
        set((state) => ({
          customServers: state.customServers.map((server) =>
            server.id === id
              ? {
                  ...server,
                  name:
                    payload.name !== undefined
                      ? payload.name.trim()
                      : server.name,
                  baseUrl:
                    payload.baseUrl !== undefined
                      ? payload.baseUrl.trim()
                      : server.baseUrl,
                  description:
                    payload.description !== undefined
                      ? payload.description?.trim()
                      : server.description,
                  apiKey:
                    payload.apiKey !== undefined
                      ? payload.apiKey?.trim()
                      : server.apiKey,
                }
              : server,
          ),
        })),
      removeCustomServer: (id) =>
        set((state) => ({
          customServers: state.customServers.filter(
            (server) => server.id !== id,
          ),
        })),
      setCustomServerEnabled: (id, enabled) =>
        set((state) => ({
          customServers: state.customServers.map((server) =>
            server.id === id ? { ...server, enabled } : server,
          ),
        })),
      getCustomServer: (id: string) => {
        return get().customServers.find((server) => server.id === id);
      },
    }),
    {
      name: "mcp-store",
      partialize: (state) => ({
        providerStates: state.providerStates,
        customServers: state.customServers,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 执行迁移
          state.providerStates = migrateProviderStates(state.providerStates);
        }
      },
    },
  ),
);

export default useMCPStore;
