import type { PluginContext, PluginMCPDefinition } from "@tau/plugins";
import type { MCPAdapter, PluginOwner } from "@tau/plugins/host";
import type { CustomMCPServer } from "@/stores/useMCPStore";
import useMCPStore from "@/stores/useMCPStore";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolJsonSchema,
} from "@/types/tool";
import { disconnectFromServer, fetchToolsFromServer, onConnectionStatusChange } from "./customMCP";
import toolRegistry from "./toolRegistry";
import { getPluginToolId, getPluginToolName } from "./plugin-tool-name";

export interface PluginMCPServerInfo {
  id: string;
  name: string;
  description?: string;
  pluginId: string;
  pluginName: string;
  server?: CustomMCPServer;
  connectionId?: string;
}

interface Entry {
  info: PluginMCPServerInfo;
  context: PluginContext;
  definition: PluginMCPDefinition;
  owner: PluginOwner & { executionIdentity: string };
  databaseName: string;
  revision: number;
  connection?: CustomMCPServer;
  calls: Map<AbortController, string>;
  pending: Promise<void>;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: PluginMCPServerInfo[] = [];
export const getPluginMCPServers = () => snapshot;
export const subscribePluginMCPServers = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const publish = () => {
  snapshot = [...entries.values()].map(entry => entry.info);
  listeners.forEach(listener => listener());
};
const enabled = (entry: Entry) =>
  entries.get(entry.info.id) === entry &&
  !entry.context.signal.aborted &&
  (useMCPStore.getState().providerStates[entry.info.id]?.enabled ?? true);

async function cancellable<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([cancelled, run()]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

function assertAvailable(
  entry: Entry,
  revision: number,
  name: string,
  context?: ToolExecutionContext
): asserts context is ToolExecutionContext {
  if (!enabled(entry) || entry.revision !== revision)
    throw new Error("插件 MCP 已停用或实例已变化，请重新发起回答");
  if (useMCPStore.getState().disabledTools[entry.info.id]?.includes(name))
    throw new Error("此工具已停用");
  if (!context || context.databaseName !== entry.databaseName)
    throw new Error("插件 MCP 所属数据库已变化，请重新发起回答");
}

async function wrapTools(
  entry: Entry,
  definitions: ToolDefinition[],
  revision: number
): Promise<ToolDefinition[]> {
  return Promise.all(
    definitions.map(async definition => {
      const name = await getPluginToolName(
        entry.context.pluginId,
        entry.definition.id,
        definition.name
      );
      const settingsKey = await getPluginToolId(
        entry.context.pluginId,
        entry.definition.id,
        definition.name
      );
      return {
        ...definition,
        name,
        settingsKey,
        displayName: `${entry.definition.id}:${definition.name.replace(/_/g, "-")}`,
        risk: "execute" as const,
        executionIdentity: `${entry.owner.executionIdentity}:${revision}:${definition.executionIdentity ?? "local"}`,
        executor: async (args: Record<string, unknown>, context?: ToolExecutionContext) => {
          assertAvailable(entry, revision, settingsKey, context);
          const controller = new AbortController();
          const signal = AbortSignal.any([
            entry.context.signal,
            controller.signal,
            AbortSignal.timeout(60_000),
            ...(context?.signal ? [context.signal] : []),
          ]);
          entry.calls.set(controller, settingsKey);
          try {
            const result = await cancellable(signal, async () =>
              definition.executor(args, { ...context, signal })
            );
            signal.throwIfAborted();
            assertAvailable(entry, revision, settingsKey, context);
            if (!result || typeof result === "string") return result;
            const render = entry.definition.tools
              ? (result.metadata?.render as { version?: number; payload?: unknown } | undefined)
              : undefined;
            const metadata = { ...result.metadata };
            delete metadata.codexItemType;
            return {
              ...result,
              metadata: {
                ...metadata,
                render: {
                  rendererKey: name,
                  ...(render ? { version: render.version, payload: render.payload } : {}),
                },
              },
            };
          } finally {
            entry.calls.delete(controller);
          }
        },
      };
    })
  );
}

function refresh(entry: Entry): void {
  const revision = ++entry.revision;
  for (const controller of entry.calls.keys()) controller.abort();
  toolRegistry.unregisterSource(entry.info.id);
  const previous = entry.connection;
  entry.connection = undefined;
  const disconnected = previous ? disconnectFromServer(previous.id) : Promise.resolve();
  const active = enabled(entry);
  const transport = entry.definition.transport
    ? (useMCPStore.getState().pluginTransports[entry.info.id] ?? entry.definition.transport)
    : undefined;
  entry.info = {
    ...entry.info,
    server: transport
      ? {
          id: entry.info.id,
          name: entry.info.name,
          description: entry.info.description,
          enabled: active,
          transport,
        }
      : undefined,
    connectionId: undefined,
  };
  useMCPStore.getState().setConnectionStatus(entry.info.id, active ? "connecting" : "disconnected");
  publish();
  entry.pending = (async () => {
    await disconnected;
    if (!enabled(entry) || entry.revision !== revision) return;
    let definitions: ToolDefinition[];
    if (transport) {
      const server: CustomMCPServer = {
        id: `plugin:${entry.owner.executionIdentity}:${revision}`,
        name: entry.info.name,
        enabled: true,
        transport,
      };
      entry.connection = server;
      entry.info = { ...entry.info, connectionId: server.id };
      publish();
      definitions = await fetchToolsFromServer(server, {
        getServer: () => (enabled(entry) && entry.revision === revision ? server : undefined),
        windowScoped: true,
        pluginId: entry.owner.id,
      });
    } else {
      const localTools = entry.definition.tools;
      if (!localTools) throw new Error("插件 MCP 未提供本地工具");
      definitions = localTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          ...tool.inputSchema,
          properties: tool.inputSchema.properties ?? {},
        } as ToolJsonSchema,
        executor: async (args, context): Promise<ToolExecutionResult> => {
          const result = await tool.execute(args as Parameters<typeof tool.execute>[0], {
            signal: context?.signal ?? entry.context.signal,
          });
          if (typeof result?.content !== "string")
            throw new Error("插件 MCP 工具必须返回文本 content");
          return {
            content: result.content,
            ...(result.render
              ? {
                  metadata: {
                    render: { version: result.render.version, payload: result.render.data },
                  },
                }
              : {}),
          };
        },
      }));
    }
    const tools = await wrapTools(entry, definitions, revision);
    if (!enabled(entry) || entry.revision !== revision) return;
    const store = useMCPStore.getState();
    toolRegistry.setDisabledTools(entry.info.id, store.disabledTools[entry.info.id] ?? []);
    toolRegistry.registerTools(entry.info.id, tools);
    store.setServerTools(
      entry.info.id,
      tools.map(({ name, settingsKey, displayName, description, parameters }) => ({
        name: settingsKey ?? name,
        displayName,
        description,
        parameters,
      }))
    );
    store.setConnectionStatus(entry.info.id, "connected");
  })().catch(error => {
    if (enabled(entry) && entry.revision === revision)
      useMCPStore
        .getState()
        .setConnectionStatus(
          entry.info.id,
          "error",
          error instanceof Error ? error.message : "MCP 加载失败"
        );
  });
}

export function reconnectPluginMCP(id: string): Promise<void> {
  const entry = entries.get(id);
  if (!entry || !enabled(entry) || !entry.definition.transport) return Promise.resolve();
  refresh(entry);
  return entry.pending;
}

export function isPluginMCP(id: string): boolean {
  return entries.has(id);
}

export function registerPluginMCP(
  context: PluginContext,
  definition: PluginMCPDefinition,
  owner: Parameters<MCPAdapter["register"]>[2],
  databaseName: string
) {
  const id = `plugin:${owner.id}:${definition.id}`;
  if (entries.has(id)) throw new Error("插件 MCP 已注册");
  const entry: Entry = {
    info: {
      id,
      name: definition.name,
      description: definition.description,
      pluginId: owner.id,
      pluginName: owner.name,
    },
    context,
    definition,
    owner,
    databaseName,
    revision: 0,
    calls: new Map(),
    pending: Promise.resolve(),
  };
  entries.set(id, entry);
  const unsubscribe = useMCPStore.subscribe((state, previous) => {
    if (
      state.providerStates[id]?.enabled !== previous.providerStates[id]?.enabled ||
      state.pluginTransports[id] !== previous.pluginTransports[id]
    )
      refresh(entry);
    if (state.disabledTools[id] !== previous.disabledTools[id]) {
      toolRegistry.setDisabledTools(id, state.disabledTools[id] ?? []);
      for (const [controller, name] of entry.calls)
        if (state.disabledTools[id]?.includes(name)) controller.abort();
    }
  });
  const unsubscribeStatus = definition.transport
    ? onConnectionStatusChange(data => {
        if (entry.connection?.id === data.serverId && enabled(entry))
          useMCPStore.getState().setConnectionStatus(id, data.status, data.error);
      })
    : () => undefined;
  let disposal: Promise<void> | undefined;
  const dispose = () => {
    if (disposal) return disposal;
    context.signal.removeEventListener("abort", abort);
    unsubscribe();
    unsubscribeStatus();
    entries.delete(id);
    entry.revision++;
    for (const controller of entry.calls.keys()) controller.abort();
    toolRegistry.unregisterSource(id);
    const connection = entry.connection;
    publish();
    const store = useMCPStore.getState();
    store.clearConnectionStatus(id);
    store.setServerTools(id, []);
    disposal = connection ? disconnectFromServer(connection.id) : Promise.resolve();
    void disposal.catch(() => undefined);
    return disposal;
  };
  const abort = () => {
    void dispose();
  };
  context.signal.addEventListener("abort", abort, { once: true });
  refresh(entry);
  return { dispose };
}
