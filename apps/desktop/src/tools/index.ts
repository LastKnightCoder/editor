import useMCPStore, { CustomMCPServer } from "@/stores/useMCPStore";
import { MCP_PROVIDERS } from "@/mcp/providers";
import toolRegistry, { ToolRegistry } from "./toolRegistry";
import { registerBuiltinTools } from "./builtinTools";
import { disconnectFromServer, fetchToolsFromServer, onConnectionStatusChange } from "./customMCP";
import useSettingStore from "@/stores/useSettingStore";

let initialized = false;
/** 上次加载时的服务器配置：store 只替换被改动的那一项，按引用比较即可只重载变化的服务器 */
let loadedCustomServers = new Map<string, CustomMCPServer>();
let mcpStatusUnsubscribe: (() => void) | null = null;

const isProviderAvailable = (provider: (typeof MCP_PROVIDERS)[number]) =>
  provider.isAvailable?.() ?? true;

const registerBuiltinProviders = (registry: ToolRegistry) => {
  const store = useMCPStore.getState();
  MCP_PROVIDERS.forEach(provider => {
    registry.unregisterSource(provider.id);
    if (!isProviderAvailable(provider)) {
      return;
    }
    const enabled = store.isProviderEnabled(provider.id);
    registry.registerTools(provider.id, provider.tools(), enabled);
  });
};

const loadCustomServer = async (server: CustomMCPServer) => {
  const store = useMCPStore.getState();
  toolRegistry.unregisterSource(server.id);

  if (!server.enabled) {
    store.setConnectionStatus(server.id, "disconnected");
    return;
  }

  store.setConnectionStatus(server.id, "connecting");
  try {
    const definitions = await fetchToolsFromServer(server);
    toolRegistry.registerTools(server.id, definitions, true);
    store.setServerTools(
      server.id,
      definitions.map(({ name, description, parameters }) => ({ name, description, parameters }))
    );
    store.setConnectionStatus(server.id, "connected");
  } catch (error) {
    console.error(`[MCP] 加载自定义 MCP 服务 ${server.name} 失败`, error);
    store.setConnectionStatus(
      server.id,
      "error",
      error instanceof Error ? error.message : "连接失败"
    );
  }
};

/** 手动重连：断开后按当前配置重新连接并刷新工具列表 */
export const reloadCustomServer = async (server: CustomMCPServer) => {
  await disconnectFromServer(server.id).catch(() => undefined);
  await loadCustomServer(server);
};

const syncDisabledTools = (next: Record<string, string[]>, prev: Record<string, string[]> = {}) => {
  new Set([...Object.keys(prev), ...Object.keys(next)]).forEach(source => {
    toolRegistry.setDisabledTools(source, next[source] ?? []);
  });
};

const syncCustomServers = (servers: CustomMCPServer[]) => {
  const next = new Map(servers.map(server => [server.id, server]));

  loadedCustomServers.forEach((_, id) => {
    if (!next.has(id)) {
      toolRegistry.unregisterSource(id);
    }
  });

  servers.forEach(server => {
    if (loadedCustomServers.get(server.id) === server) return;
    void loadCustomServer(server);
  });
  loadedCustomServers = next;
};

export const initializeTooling = () => {
  if (initialized) {
    return;
  }
  initialized = true;

  if (!mcpStatusUnsubscribe) {
    const store = useMCPStore.getState();
    mcpStatusUnsubscribe = onConnectionStatusChange(data => {
      if (store.getCustomServer(data.serverId))
        store.setConnectionStatus(data.serverId, data.status, data.error);
    });
  }

  syncDisabledTools(useMCPStore.getState().disabledTools);
  registerBuiltinTools(toolRegistry);
  registerBuiltinProviders(toolRegistry);
  syncCustomServers(useMCPStore.getState().customServers);

  useMCPStore.subscribe((state, prevState) => {
    if (!prevState || state.providerStates !== prevState.providerStates) {
      MCP_PROVIDERS.forEach(provider => {
        if (!isProviderAvailable(provider)) {
          toolRegistry.unregisterSource(provider.id);
          return;
        }
        const hasRegisteredTools = toolRegistry.hasSource(provider.id);
        if (!hasRegisteredTools) {
          toolRegistry.registerTools(
            provider.id,
            provider.tools(),
            state.providerStates[provider.id]?.enabled ?? provider.defaultEnabled ?? false
          );
          return;
        }
        const enabled =
          state.providerStates[provider.id]?.enabled ?? provider.defaultEnabled ?? false;
        toolRegistry.setSourceEnabled(provider.id, enabled);
      });
    }

    if (state.disabledTools !== prevState?.disabledTools) {
      syncDisabledTools(state.disabledTools, prevState?.disabledTools);
    }

    if (!prevState || state.customServers !== prevState.customServers) {
      syncCustomServers(state.customServers);
    }
  });

  useSettingStore.subscribe((state, prevState) => {
    if (state.setting.imageGeneration !== prevState.setting.imageGeneration) {
      registerBuiltinProviders(toolRegistry);
    }
  });
};

export const ensureToolingReady = () => {
  if (!initialized) {
    initializeTooling();
  }
};

export default toolRegistry;
