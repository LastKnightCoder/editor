import useMCPStore, { CustomMCPServer } from "@/stores/useMCPStore";
import { MCP_PROVIDERS } from "@/mcp/providers";
import toolRegistry, { ToolRegistry } from "./toolRegistry";
import { registerBuiltinTools } from "./builtinTools";
import { fetchToolsFromServer } from "./customMCP";
import useSettingStore from "@/stores/useSettingStore";

let initialized = false;
let knownCustomServerIds = new Set<string>();

const isProviderAvailable = (provider: (typeof MCP_PROVIDERS)[number]) =>
  provider.isAvailable?.() ?? true;

const registerBuiltinProviders = (registry: ToolRegistry) => {
  const store = useMCPStore.getState();
  MCP_PROVIDERS.forEach((provider) => {
    registry.unregisterSource(provider.id);
    if (!isProviderAvailable(provider)) {
      return;
    }
    const enabled = store.isProviderEnabled(provider.id);
    registry.registerTools(provider.id, provider.tools(), enabled);
  });
};

const loadCustomServer = async (server: CustomMCPServer) => {
  toolRegistry.unregisterSource(server.id);

  if (!server.enabled) {
    return;
  }

  try {
    const definitions = await fetchToolsFromServer(server);
    toolRegistry.registerTools(server.id, definitions, true);
  } catch (error) {
    console.error(`[MCP] 加载自定义 MCP 服务 ${server.name} 失败`, error);
  }
};

const syncCustomServers = (servers: CustomMCPServer[]) => {
  const nextIds = new Set(servers.map((server) => server.id));

  knownCustomServerIds.forEach((id) => {
    if (!nextIds.has(id)) {
      toolRegistry.unregisterSource(id);
    }
  });
  knownCustomServerIds = nextIds;

  servers.forEach((server) => {
    void loadCustomServer(server);
  });
};

export const initializeTooling = () => {
  if (initialized) {
    return;
  }
  initialized = true;

  registerBuiltinTools(toolRegistry);
  registerBuiltinProviders(toolRegistry);
  syncCustomServers(useMCPStore.getState().customServers);

  useMCPStore.subscribe((state, prevState) => {
    if (!prevState || state.providerStates !== prevState.providerStates) {
      MCP_PROVIDERS.forEach((provider) => {
        if (!isProviderAvailable(provider)) {
          toolRegistry.unregisterSource(provider.id);
          return;
        }
        const hasRegisteredTools = toolRegistry.hasSource(provider.id);
        if (!hasRegisteredTools) {
          toolRegistry.registerTools(
            provider.id,
            provider.tools(),
            state.providerStates[provider.id]?.enabled ??
              provider.defaultEnabled ??
              false,
          );
          return;
        }
        const enabled =
          state.providerStates[provider.id]?.enabled ??
          provider.defaultEnabled ??
          false;
        toolRegistry.setSourceEnabled(provider.id, enabled);
      });
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
