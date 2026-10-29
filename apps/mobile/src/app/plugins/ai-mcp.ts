import type { Disposable, JsonValue, PluginContext, PluginMCPDefinition } from "@tau/plugins";
import { copyJson, type MCPAdapter } from "@tau/plugins/host";
import { AiError, type AiToolExecutionContext } from "@tau/ai/contracts";
import { getPluginToolId, getPluginToolName } from "@tau/ai/tool-identity";
import type { AiMcpConnectionOptions } from "@tau/ai/mcp";
import { waitForSignal } from "@tau/ai/tools";
import type { MobileAiService } from "../../services/ai/service";

export interface MobilePluginMcpAi {
  tools: Pick<MobileAiService["tools"], "register">;
  mcp: Pick<MobileAiService["mcp"], "connect" | "disconnect" | "list" | "subscribe">;
  lifecycle: Pick<MobileAiService["lifecycle"], "assertExecution">;
}
export interface MobilePluginMcpState {
  id: string;
  pluginId: string;
  pluginName: string;
  mcpId: string;
  name: string;
  status: "preparing" | "connected" | "disconnected" | "error";
  toolIds: readonly string[];
  connectionId?: string;
  error?: string;
}
type Owner = Parameters<MCPAdapter["register"]>[2];
type Entry = {
  id: string;
  context: PluginContext;
  owner: Owner;
  definition: PluginMCPDefinition;
  ai: Promise<MobilePluginMcpAi>;
  controller: AbortController;
  token: string;
  state: MobilePluginMcpState;
  cleanups: Array<() => void>;
  connectionId?: string;
  pending: Promise<void>;
  disposal?: Promise<void>;
};

export function createMobilePluginMcp(options: {
  databaseName: string;
  ai: () => MobilePluginMcpAi | Promise<MobilePluginMcpAi>;
  onChange?: () => void;
  timeoutMs?: number;
}) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const draining = new Set<Promise<void>>();
  let disposed = false;
  let shutdown: Promise<void> | undefined;
  let snapshot: readonly MobilePluginMcpState[] = Object.freeze([]);
  const publish = () => {
    snapshot = Object.freeze(
      [...entries.values()].map(entry =>
        Object.freeze({
          ...entry.state,
          toolIds: Object.freeze([...entry.state.toolIds]),
        })
      )
    );
    for (const listener of [...listeners, ...(options.onChange ? [options.onChange] : [])]) {
      try {
        listener();
      } catch {
        /* 观察者失败不改变能力归属。 */
      }
    }
  };
  const active = (entry: Entry) =>
    !disposed &&
    entries.get(entry.id) === entry &&
    !entry.controller.signal.aborted &&
    !entry.context.signal.aborted;
  const assertActive = (entry: Entry, context?: AiToolExecutionContext) => {
    if (!active(entry)) throw new AiError("AI_TOOL_UNAVAILABLE", "插件 MCP 已停用或实例已变化");
    if (context && context.session.databaseName !== options.databaseName)
      throw new AiError("AI_LIBRARY_CHANGED", "插件 MCP 不属于本次运行的数据库");
  };
  const disconnect = async (entry: Entry) => {
    if (entry.connectionId)
      await (await entry.ai).mcp.disconnect(options.databaseName, entry.connectionId);
  };
  const disposeEntry = (entry: Entry): Promise<void> => {
    if (entry.disposal) return entry.disposal;
    if (entries.get(entry.id) === entry) entries.delete(entry.id);
    entry.controller.abort(new DOMException("插件 MCP 已释放", "AbortError"));
    const failures: unknown[] = [];
    for (const cleanup of entry.cleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    const closing = disconnect(entry);
    entry.disposal = Promise.allSettled([closing, entry.pending.catch(() => undefined)]).then(
      results => {
        for (const result of results)
          if (result.status === "rejected") failures.push(result.reason);
        if (failures.length) throw new AggregateError(failures, "插件 MCP 回收失败");
      }
    );
    const disposal = entry.disposal;
    draining.add(disposal);
    void disposal.finally(() => draining.delete(disposal)).catch(() => undefined);
    void entry.disposal.catch(() => undefined);
    publish();
    return entry.disposal;
  };

  const prepare = async (entry: Entry) => {
    const ai = await waitForSignal(entry.ai, entry.controller.signal);
    assertActive(entry);
    const definition = entry.definition;
    if (definition.transport) {
      const connectionId = `plugin:${entry.owner.executionIdentity}:${entry.token}`;
      entry.connectionId = connectionId;
      const syncState = () => {
        if (!active(entry)) return;
        const state = ai.mcp.list(options.databaseName).find(value => value.id === connectionId);
        if (!state) return;
        entry.state = {
          ...entry.state,
          status:
            state.status === "connected"
              ? "connected"
              : state.status === "connecting"
                ? "preparing"
                : state.status === "disconnected"
                  ? "disconnected"
                  : "error",
          toolIds: state.toolIds,
          connectionId,
          error: state.error,
        };
        publish();
      };
      entry.cleanups.push(ai.mcp.subscribe(options.databaseName, syncState));
      const mapping: AiMcpConnectionOptions = {
        resolveToolIdentity: async (_config, toolName) => {
          assertActive(entry);
          const [id, name] = await Promise.all([
            getPluginToolId(entry.owner.id, definition.id, toolName),
            getPluginToolName(entry.owner.id, definition.id, toolName),
          ]);
          assertActive(entry);
          return {
            id,
            name,
            sourceId: entry.id,
            executionIdentity: `${entry.owner.executionIdentity}:${entry.token}`,
            metadata: { render: { rendererKey: name } },
          };
        },
      };
      const connecting = ai.mcp.connect(
        options.databaseName,
        {
          id: connectionId,
          name: definition.name,
          transport: definition.transport,
        },
        mapping
      );
      void connecting.then(
        () => {
          if (!active(entry)) void disconnect(entry).catch(() => undefined);
        },
        () => undefined
      );
      const state = await waitForSignal(connecting, entry.controller.signal);
      assertActive(entry);
      if (state.status !== "connected")
        throw new AiError("AI_MCP_CONNECTION_FAILED", "插件 MCP 未连接");
      entry.state = { ...entry.state, status: "connected", toolIds: state.toolIds, connectionId };
      publish();
      return;
    }
    const definitions = await Promise.all(
      definition.tools.map(async tool => ({
        tool,
        id: await getPluginToolId(entry.owner.id, definition.id, tool.name),
        name: await getPluginToolName(entry.owner.id, definition.id, tool.name),
      }))
    );
    assertActive(entry);
    for (const { tool, id, name } of definitions) {
      entry.cleanups.push(
        ai.tools.register(
          {
            id,
            name,
            description: tool.description,
            inputSchema: copyJson(tool.inputSchema) as Record<string, unknown>,
            risk: "execute",
            sourceId: entry.id,
            executionIdentity: `${entry.owner.executionIdentity}:${entry.token}`,
          },
          async (input, context) => {
            assertActive(entry, context);
            await ai.lifecycle.assertExecution(context);
            const controller = new AbortController();
            const signals = [entry.controller.signal, context.signal];
            const abort = (event: Event) => controller.abort((event.target as AbortSignal).reason);
            for (const signal of signals) {
              if (signal.aborted) controller.abort(signal.reason);
              else signal.addEventListener("abort", abort, { once: true });
            }
            const timer = setTimeout(
              () => controller.abort(new DOMException("插件工具执行超时", "TimeoutError")),
              options.timeoutMs ?? 60_000
            );
            let started = false;
            try {
              controller.signal.throwIfAborted();
              assertActive(entry, context);
              started = true;
              const result = await waitForSignal(
                Promise.resolve(
                  tool.execute(copyJson(input) as Record<string, JsonValue>, {
                    signal: controller.signal,
                  })
                ),
                controller.signal
              );
              controller.signal.throwIfAborted();
              assertActive(entry, context);
              await ai.lifecycle.assertExecution(context);
              if (!result || typeof result.content !== "string")
                throw new Error("插件 MCP 工具必须返回文本 content");
              if (
                result.render &&
                (!Number.isSafeInteger(result.render.version) || result.render.version < 1)
              )
                throw new Error("工具展示数据需要正整数版本");
              return {
                content: result.content,
                metadata: {
                  render: {
                    rendererKey: name,
                    ...(result.render
                      ? { version: result.render.version, payload: copyJson(result.render.data) }
                      : {}),
                  },
                },
              };
            } catch (error) {
              if (
                started &&
                (controller.signal.aborted ||
                  !active(entry) ||
                  (error instanceof AiError &&
                    ["AI_LIBRARY_CHANGED", "AI_LIBRARY_BUSY"].includes(error.code)))
              )
                throw new AiError(
                  "AI_TOOL_OUTCOME_UNKNOWN",
                  "插件工具已中断，执行结果未知，不能自动重放"
                );
              throw error;
            } finally {
              clearTimeout(timer);
              for (const signal of signals) signal.removeEventListener("abort", abort);
            }
          },
          { databaseName: options.databaseName }
        )
      );
    }
    entry.state = {
      ...entry.state,
      status: "connected",
      toolIds: definitions.map(tool => tool.id),
    };
    publish();
  };

  const adapter: MCPAdapter = {
    register(context, definition, owner): Disposable {
      if (disposed || context.signal.aborted)
        throw new AiError("AI_TOOL_UNAVAILABLE", "插件 MCP 宿主已释放");
      if (context.workspaceId !== options.databaseName || context.pluginId !== owner.id)
        throw new AiError("AI_LIBRARY_CHANGED", "插件 MCP 来源不属于当前工作区");
      if (definition.transport?.type === "stdio")
        throw new AiError("AI_MCP_UNSUPPORTED_TRANSPORT", "移动端不支持 stdio MCP");
      const id = `plugin:${owner.id}:${definition.id}`;
      if (entries.has(id)) throw new AiError("AI_TOOL_UNAVAILABLE", "插件 MCP 已注册");
      const captured: PluginMCPDefinition = definition.transport
        ? {
            id: definition.id,
            name: definition.name,
            description: definition.description,
            transport: copyJson(definition.transport) as unknown as NonNullable<
              PluginMCPDefinition["transport"]
            >,
          }
        : {
            id: definition.id,
            name: definition.name,
            description: definition.description,
            tools: definition.tools.map(tool => ({
              ...tool,
              inputSchema: copyJson(tool.inputSchema) as typeof tool.inputSchema,
            })),
          };
      const entry: Entry = {
        id,
        context,
        owner: { ...owner },
        definition: captured,
        ai: Promise.resolve().then(options.ai),
        controller: new AbortController(),
        token: crypto.randomUUID(),
        state: {
          id,
          pluginId: owner.id,
          pluginName: owner.name,
          mcpId: definition.id,
          name: definition.name,
          status: "preparing",
          toolIds: [],
        },
        cleanups: [],
        pending: Promise.resolve(),
      };
      entries.set(id, entry);
      const abort = () => {
        void disposeEntry(entry);
      };
      context.signal.addEventListener("abort", abort, { once: true });
      entry.cleanups.push(() => context.signal.removeEventListener("abort", abort));
      publish();
      entry.pending = prepare(entry).catch(error => {
        if (active(entry)) {
          for (const cleanup of entry.cleanups.splice(1).reverse()) cleanup();
          entry.state = {
            ...entry.state,
            status: "error",
            toolIds: [],
            error: error instanceof AiError ? error.message : "插件 MCP 初始化失败",
          };
          publish();
        }
        throw error;
      });
      void entry.pending.catch(() => undefined);
      return { dispose: () => disposeEntry(entry) };
    },
  };
  return {
    adapter,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready: async () => {
      await Promise.all([...entries.values()].map(entry => entry.pending));
    },
    dispose(): Promise<void> {
      if (shutdown) return shutdown;
      disposed = true;
      shutdown = Promise.resolve().then(async () => {
        for (const entry of entries.values()) void disposeEntry(entry).catch(() => undefined);
        const results = await Promise.allSettled([...draining]);
        listeners.clear();
        const failures = results.filter(
          (result): result is PromiseRejectedResult => result.status === "rejected"
        );
        if (failures.length)
          throw new AggregateError(
            failures.map(result => result.reason),
            "插件 MCP 宿主回收失败"
          );
      });
      return shutdown;
    },
  };
}

export type MobilePluginMcp = ReturnType<typeof createMobilePluginMcp>;
