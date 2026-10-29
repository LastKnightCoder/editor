// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext, type PluginMCPDefinition } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { AiError, type AiToolExecutionContext } from "@tau/ai/contracts";
import { AiToolRegistry } from "@tau/ai/tools";
import { getPluginToolId, getPluginToolName } from "@tau/ai/tool-identity";
import type { AiMcpServerConfig, AiMcpServerState } from "@tau/ai/mcp";
import { createMobilePluginMcp, type MobilePluginMcpAi } from "./ai-mcp";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => {
    resolve = finish;
  });
  return { promise, resolve };
};
const owner = { id: "test.mcp", name: "测试插件", executionIdentity: "activation-1" };
const context = (controller = new AbortController()) =>
  ({ pluginId: owner.id, workspaceId: "one.db", signal: controller.signal }) as PluginContext;
const executeContext = (
  databaseName = "one.db",
  controller = new AbortController()
): AiToolExecutionContext => ({
  session: { databaseName, sessionId: "session-1" },
  runId: "run-1",
  toolCallId: "call-1",
  executionId: crypto.randomUUID(),
  operationId: crypto.randomUUID(),
  signal: controller.signal,
});
const definition = (
  execute: NonNullable<PluginMCPDefinition["tools"]>[number]["execute"] = () => ({
    content: "卡片正文",
    render: { version: 1, data: { title: "卡片" } },
  })
): PluginMCPDefinition => ({
  id: "notes",
  name: "笔记工具",
  tools: [
    {
      name: "lookup",
      description: "读取笔记",
      inputSchema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
      execute,
    },
  ],
});

function clientFixture(track = true) {
  const registry = new AiToolRegistry();
  const states = new Map<string, AiMcpServerState>();
  const unregister = new Map<string, () => void>();
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  const assertExecution = vi.fn(async (ctx: AiToolExecutionContext) => {
    ctx.signal.throwIfAborted();
    if (ctx.session.databaseName !== "one.db") throw new AiError("AI_LIBRARY_CHANGED", "库已变化");
    return { leaseId: "lease-1", databaseName: "one.db", generation: 1 };
  });
  const client: MobilePluginMcpAi = {
    tools: { register: vi.fn((spec, execute) => registry.register(spec, execute)) },
    lifecycle: { assertExecution },
    mcp: {
      list: () => [...states.values()],
      subscribe: (_database, listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      connect: vi.fn(async (_database, config, options) => {
        const identity = await options?.resolveToolIdentity?.(config, "remote_lookup");
        if (!identity) throw new Error("缺少插件身份映射");
        unregister.set(
          config.id,
          registry.register(
            {
              id: identity.id,
              name: identity.name,
              sourceId: identity.sourceId,
              executionIdentity: `${identity.executionIdentity}:remote-1`,
              inputSchema: { type: "object" },
              description: "远端工具",
              risk: "execute",
            },
            async () => ({ content: "远端正文", metadata: identity.metadata })
          )
        );
        const state: AiMcpServerState = {
          id: config.id,
          name: config.name,
          status: "connected",
          toolIds: [identity.id],
        };
        states.set(config.id, state);
        changed();
        return state;
      }),
      disconnect: vi.fn(async (_database, id) => {
        unregister.get(id)?.();
        unregister.delete(id);
        const previous = states.get(id);
        if (previous) states.set(id, { ...previous, status: "disconnected", toolIds: [] });
        changed();
      }),
    },
  };
  const adapter = createMobilePluginMcp({ databaseName: "one.db", ai: async () => client });
  if (track) cleanups.push(adapter.dispose);
  return { client, registry, adapter, assertExecution, states, changed };
}

it("本地插件工具沿用桌面稳定名称/历史身份，默认execute并保留版本化渲染数据", async () => {
  const { adapter, registry, assertExecution } = clientFixture();
  const execute = vi.fn(async () => ({
    content: "卡片正文",
    render: { version: 1, data: { title: "卡片" } },
  }));
  adapter.adapter.register(context(), definition(execute), owner);
  await adapter.ready();
  const id = await getPluginToolId(owner.id, "notes", "lookup");
  const name = await getPluginToolName(owner.id, "notes", "lookup");
  expect(id).toBe("plugin_c8f8c15ff486e548_lookup");
  expect(registry.list()[0]).toMatchObject({
    id,
    name,
    sourceId: "plugin:test.mcp:notes",
    risk: "execute",
  });
  const snapshot = registry.capture([id]);
  await expect(
    snapshot.execute(id, { id: 5 }, executeContext(), { interactionMode: "none" })
  ).rejects.toMatchObject({ code: "AI_INTERACTION_UNAVAILABLE" });
  expect(execute).not.toHaveBeenCalled();
  expect(
    await snapshot.execute(id, { id: 5 }, executeContext(), {
      interactionMode: "none",
      permissionMode: "bypass",
    })
  ).toMatchObject({
    content: "卡片正文",
    metadata: { render: { rendererKey: name, version: 1, payload: { title: "卡片" } } },
  });
  expect(assertExecution).toHaveBeenCalledTimes(2);
});

it("停用会中断本地执行并撤销快照，迟到结果不能被新实例认领", async () => {
  const { adapter, registry } = clientFixture();
  const lifetime = new AbortController();
  const started = deferred<void>();
  const late = deferred<{ content: string }>();
  let signal: AbortSignal | undefined;
  adapter.adapter.register(
    context(lifetime),
    definition((_args, call) => {
      signal = call.signal;
      started.resolve();
      return late.promise;
    }),
    owner
  );
  await adapter.ready();
  const id = registry.list()[0].id;
  const snapshot = registry.capture([id]);
  const result = snapshot.execute(id, { id: 1 }, executeContext(), {
    interactionMode: "none",
    permissionMode: "bypass",
  });
  await started.promise;
  const failure = expect(result).rejects.toMatchObject({ code: "AI_TOOL_OUTCOME_UNKNOWN" });
  lifetime.abort();
  await failure;
  expect(signal?.aborted).toBe(true);
  expect(snapshot.isCurrent()).toBe(false);
  expect(adapter.getSnapshot()).toHaveLength(0);
  late.resolve({ content: "迟到结果" });
});

it("异库调用先拒绝，恢复新租约不需要重新注册inline声明", async () => {
  const { adapter, registry, assertExecution } = clientFixture();
  const execute = vi.fn(async () => ({ content: "正文" }));
  adapter.adapter.register(context(), definition(execute), owner);
  await adapter.ready();
  const id = registry.list()[0].id;
  const snapshot = registry.capture([id]);
  await expect(
    snapshot.execute(id, { id: 1 }, executeContext("other.db"), {
      interactionMode: "none",
      permissionMode: "bypass",
    })
  ).rejects.toMatchObject({ code: "AI_LIBRARY_CHANGED" });
  expect(execute).not.toHaveBeenCalled();
  assertExecution.mockResolvedValue({
    leaseId: "resumed-lease",
    databaseName: "one.db",
    generation: 2,
  });
  await snapshot.execute(id, { id: 1 }, executeContext(), {
    interactionMode: "none",
    permissionMode: "bypass",
  });
  expect(snapshot.isCurrent()).toBe(true);
  expect(execute).toHaveBeenCalledOnce();
});

it("远端插件使用每次注册的独立连接，按稳定identity映射并同步断线状态", async () => {
  const { adapter, client, registry, states, changed } = clientFixture();
  const lifetime = new AbortController();
  adapter.adapter.register(
    context(lifetime),
    {
      id: "remote",
      name: "远程",
      transport: { type: "streamable-http", url: "https://validation.invalid/mcp" },
    },
    owner
  );
  await adapter.ready();
  const connectionId = adapter.getSnapshot()[0].connectionId;
  if (!connectionId) throw new Error("连接未登记");
  expect(connectionId).toMatch(/^plugin:activation-1:/);
  expect(registry.list()[0]).toMatchObject({
    id: await getPluginToolId(owner.id, "remote", "remote_lookup"),
    sourceId: "plugin:test.mcp:remote",
    risk: "execute",
  });
  const state = states.get(connectionId);
  if (!state) throw new Error("连接状态缺失");
  states.set(connectionId, { ...state, status: "disconnected", toolIds: [] });
  changed();
  expect(adapter.getSnapshot()[0].status).toBe("disconnected");
  lifetime.abort();
  await adapter.dispose();
  expect(client.mcp.disconnect).toHaveBeenCalledWith("one.db", connectionId);
});

it("在途连接停用后立即收尾，迟到连接只回收旧ID不影响新注册", async () => {
  const { adapter, client } = clientFixture();
  const connecting = deferred<AiMcpServerState>();
  const began = deferred<void>();
  let config: AiMcpServerConfig | undefined;
  vi.mocked(client.mcp.connect).mockImplementationOnce(async (_database, input) => {
    config = input;
    began.resolve();
    return connecting.promise;
  });
  const lifetime = new AbortController();
  const handle = adapter.adapter.register(
    context(lifetime),
    {
      id: "remote",
      name: "远端",
      transport: { type: "streamable-http", url: "https://validation.invalid/mcp" },
    },
    owner
  );
  await began.promise;
  await handle.dispose();
  if (!config) throw new Error("连接未开始");
  connecting.resolve({ id: config.id, name: config.name, status: "connected", toolIds: [] });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(client.mcp.disconnect).toHaveBeenCalledWith("one.db", config.id);
  expect(adapter.getSnapshot()).toHaveLength(0);
});

it("异步初始化错误同时进入快照和ready，不伪装为成功", async () => {
  const { adapter, client } = clientFixture();
  vi.mocked(client.mcp.connect).mockRejectedValueOnce(
    new AiError("AI_MCP_CONNECTION_FAILED", "测试连接失败")
  );
  adapter.adapter.register(
    context(),
    {
      id: "remote",
      name: "远端",
      transport: { type: "streamable-http", url: "https://validation.invalid/mcp" },
    },
    owner
  );
  await expect(adapter.ready()).rejects.toMatchObject({ code: "AI_MCP_CONNECTION_FAILED" });
  expect(adapter.getSnapshot()[0]).toMatchObject({
    status: "error",
    error: "测试连接失败",
    toolIds: [],
  });
});

it("stdio同步拒绝且不初始化AI，激活失败不会发布预备声明", async () => {
  const { client, registry } = clientFixture();
  const getter = vi.fn(async () => client);
  const adapter = createMobilePluginMcp({ databaseName: "one.db", ai: getter });
  cleanups.push(adapter.dispose);
  expect(() =>
    adapter.adapter.register(
      context(),
      { id: "stdio", name: "桌面", transport: { type: "stdio", command: "node" } },
      owner
    )
  ).toThrow(expect.objectContaining({ code: "AI_MCP_UNSUPPORTED_TRANSPORT" }));
  expect(getter).not.toHaveBeenCalled();
  const host = new PluginHost({
    workspaceId: "one.db",
    environment: { platform: "ios", input: { coarsePointer: true, finePointer: false } },
    storage: createMemoryStorage(),
    mcp: adapter.adapter,
  });
  cleanups.push(() => host.dispose());
  host.registerTrusted(
    definePlugin({
      id: owner.id,
      name: owner.name,
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          ctx.mcp.register(definition());
          throw new Error("激活失败");
        },
      }),
    })
  );
  await expect(host.enable(owner.id)).rejects.toThrow("激活失败");
  expect(registry.list()).toHaveLength(0);
  expect(getter).not.toHaveBeenCalled();
});

it("一个连接回收失败仍等待其他连接收尾，然后聚合报告失败", async () => {
  const { adapter, client } = clientFixture(false);
  for (const id of ["first", "second"])
    adapter.adapter.register(
      context(),
      {
        id,
        name: id,
        transport: { type: "streamable-http", url: "https://validation.invalid/mcp" },
      },
      owner
    );
  await adapter.ready();
  const waiting = deferred<void>();
  const started = deferred<void>();
  vi.mocked(client.mcp.disconnect).mockRejectedValueOnce(new Error("第一项回收失败"));
  vi.mocked(client.mcp.disconnect).mockImplementationOnce(async () => {
    started.resolve();
    await waiting.promise;
  });
  let finished = false;
  const disposal = adapter.dispose();
  void disposal.then(
    () => {
      finished = true;
    },
    () => {
      finished = true;
    }
  );
  await started.promise;
  expect(finished).toBe(false);
  waiting.resolve();
  await expect(disposal).rejects.toBeInstanceOf(AggregateError);
  expect(client.mcp.disconnect).toHaveBeenCalledTimes(2);
});
