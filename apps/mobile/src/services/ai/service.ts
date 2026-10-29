import {
  AiError,
  type AiErrorCode,
  type AiModelRef,
  type AiRunStartRequest,
  type AiSessionRef,
  type AiToolExecutor,
  type AiToolExecutionContext,
} from "@tau/ai/contracts";
import { resolveConfiguredModel, type AiModelConfig, type AiPublicProvider } from "@tau/ai/models";
import {
  AiRuntime,
  type AiGenerationRequest,
  type AiResolvedModel,
  type AiRunHandle,
  type AiRetryRunRequest,
  type AiRuntimeOptions,
  type AiSessionStore,
  type AiStoredSession,
} from "@tau/ai/runtime";
import {
  applySessionEdit,
  createSessionFile,
  parseSessionFile,
  projectSessionMessages,
  type SessionEdit,
} from "@tau/ai/session";
import { AiToolRegistry, type AiToolRegistrationSpec, type AiToolSnapshot } from "@tau/ai/tools";
import {
  AiSkillRegistry,
  createSkillTools,
  formatSkillCatalog,
  type AiSkillSnapshot,
  type AiSkillSource,
} from "@tau/ai/skills";
import { AiMcpManager, type AiMcpServerConfig, type AiMcpConnectionOptions } from "@tau/ai/mcp";
import * as native from "./native";

type NativeContext = Pick<Awaited<ReturnType<typeof native.createModelFetch>>, "fetch" | "dispose">;
type SessionPatch = Parameters<typeof native.patchSession>[3];
type SessionFilter = Parameters<typeof native.listSessions>[1];
type GenerationHandle = Awaited<ReturnType<AiRuntime["generate"]>>;

export interface MobileAiSessionSnapshot extends AiStoredSession {
  messages: ReturnType<typeof projectSessionMessages>;
  leafId: string | null;
  formatVersion: number;
}

export interface MobileAiOptions {
  permissionMode?: AiRuntimeOptions["permissionMode"];
  approve?: AiRuntimeOptions["approve"];
  question?: AiRuntimeOptions["question"];
  prepareInput?: AiRuntimeOptions["prepareInput"];
  preparePrompt?: AiRuntimeOptions["preparePrompt"];
  maxTurns?: number;
}

const keyOf = (ref: AiSessionRef) => JSON.stringify([ref.databaseName, ref.sessionId]);
const decode = (value: string) =>
  Uint8Array.from(atob(value), character => character.charCodeAt(0));
const knownRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function errorOf(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (knownRecord(error) && typeof error.code === "string" && /^AI_[A-Z_]+$/.test(error.code))
    return new AiError(
      error.code as AiErrorCode,
      typeof error.message === "string" ? error.message : "原生 AI 操作失败",
      error.retryable === true
    );
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = /^(AI_[A-Z_]+):\s*([\s\S]*)$/.exec(message);
  return match
    ? new AiError(match[1] as AiErrorCode, match[2])
    : new AiError("AI_STORAGE_FAILED", "原生 AI 操作失败");
}

/** 页面之外持有运行与原生租约；本模块不会注册业务工具或创建功能入口。 */
export class MobileAiService {
  readonly capabilities: Readonly<{
    persistentSessions: true;
    historyEdit: true;
    imageDataInput: true;
    hostAttachments: boolean;
    approvals: boolean;
    questions: boolean;
    remoteMcp: true;
    skillScripts: false;
  }>;
  private readonly registry = new AiToolRegistry();
  private readonly skillRegistry = new AiSkillRegistry();
  private readonly skillSnapshots = new Map<string, AiSkillSnapshot>();
  private readonly leases = new Map<string, Promise<native.NativeLibraryLease>>();
  private readonly busy = new Map<string, { kind: "run" | "mutation"; id: string }>();
  private readonly actions = new Map<Promise<unknown>, string>();
  private readonly blocks = new Map<string, number>();
  private readonly releases = new Map<string, Promise<void>>();
  private readonly contexts = new Map<string, Set<NativeContext>>();
  private readonly ownedRegistrations = new Map<() => void, string | undefined>();
  private readonly toolScopes = new Map<
    string,
    { databaseName: string; token: symbol; executionIdentity: string }
  >();
  private readonly mcpEntries = new Map<
    string,
    { manager: AiMcpManager; contexts: Map<string, NativeContext>; releaseScope(): void }
  >();
  private readonly generations = new Map<
    string,
    { databaseName: string; handle: GenerationHandle }
  >();
  private readonly runtime: AiRuntime;
  private disposed = false;
  private disposePromise?: Promise<void>;
  private paused = false;
  private pauseIntent = 0;
  private suspendPromise?: Promise<void>;

  constructor(options: MobileAiOptions = {}) {
    this.capabilities = Object.freeze({
      persistentSessions: true,
      historyEdit: true,
      imageDataInput: true,
      hostAttachments: !!options.prepareInput,
      approvals: !!options.approve,
      questions: !!options.question,
      remoteMcp: true,
      skillScripts: false,
    });
    const store: AiSessionStore = {
      read: ref => this.readStored(ref),
      append: async (ref, expectedRevision, entries, operationId) => {
        const lease = await this.lease(ref.databaseName);
        try {
          await native.commitSession(lease, {
            sessionId: ref.sessionId,
            operationId,
            expectedRevision,
            entries,
          });
          return await this.readStored(ref);
        } catch (error) {
          throw errorOf(error);
        }
      },
      beginRun: async (ref, runId) => {
        this.assertOpen(ref.databaseName);
        const lease = await this.lease(ref.databaseName);
        this.assertOpen(ref.databaseName);
        try {
          await native.setRunActive(lease, runId, true, ref.sessionId);
        } catch (error) {
          throw errorOf(error);
        }
        return () => this.endActivity(lease, runId, ref.sessionId);
      },
    };
    this.runtime = new AiRuntime({
      store,
      tools: this.registry,
      resolveModel: (model, session, expectedModelRevision) =>
        this.resolveModel(model, session, expectedModelRevision),
      prepareInput: options.prepareInput,
      prepareTools: (request, signal, base) => this.prepareTools(request, signal, base),
      preparePrompt: async (request, signal) => {
        const base = await options.preparePrompt?.(request, signal);
        const skills = await this.preparePrompt(request, signal);
        return {
          ...(typeof base === "string" ? { content: base } : base),
          sections: {
            ...(typeof base === "object" ? base.sections : undefined),
            ...skills.sections,
          },
        };
      },
      permissionMode: options.permissionMode,
      approve: options.approve,
      question: options.question,
      maxTurns: options.maxTurns,
    });
  }

  readonly models = {
    list: async (): Promise<AiPublicProvider[]> => (await this.modelConfig()).llmProviders,
    getConfiguration: (): Promise<AiModelConfig> => this.modelConfig(),
    resolve: async (ref: AiModelRef) =>
      structuredClone(resolveConfiguredModel(await this.modelConfig(), ref)),
    verify: async (databaseName: string, ref: AiModelRef) => {
      const handle = await this.generation.start({
        requestId: crypto.randomUUID(),
        databaseName,
        model: ref,
        messages: [{ role: "user", content: "请回复 OK。" }],
      });
      const result = await handle.result;
      return { ok: result.outcome === "completed", outcome: result.outcome, error: result.error };
    },
  };

  readonly sessions = {
    create: async (input: {
      databaseName: string;
      id?: string;
      scope: string;
      domainRef?: string | null;
      title?: string;
    }) => {
      const ref = { databaseName: input.databaseName, sessionId: input.id ?? crypto.randomUUID() };
      return this.mutate(ref, async lease => {
        await native.createSession(lease, {
          id: ref.sessionId,
          scope: input.scope,
          domainRef: input.domainRef,
          title: input.title,
          header: createSessionFile({ id: ref.sessionId }).header,
        });
        return this.snapshot(await this.readStored(ref));
      });
    },
    get: async (ref: AiSessionRef): Promise<MobileAiSessionSnapshot> => {
      this.assertOpen(ref.databaseName);
      return this.snapshot(await this.readStored(ref));
    },
    list: async (databaseName: string, filter: SessionFilter = {}) => {
      this.assertOpen(databaseName);
      try {
        return await native.listSessions(await this.lease(databaseName), filter);
      } catch (error) {
        throw errorOf(error);
      }
    },
    patch: async (ref: AiSessionRef, expectedRevision: string, patch: SessionPatch) =>
      this.mutate(ref, async lease => {
        await native.patchSession(lease, ref.sessionId, expectedRevision, patch);
        return this.snapshot(await this.readStored(ref));
      }),
    remove: async (ref: AiSessionRef, expectedRevision: string) =>
      this.mutate(ref, lease => native.removeSession(lease, ref.sessionId, expectedRevision)),
    editHistory: async (ref: AiSessionRef, expectedRevision: string, edit: SessionEdit) =>
      this.mutate(ref, async lease => {
        const current = await this.readStored(ref);
        if (current.revision !== expectedRevision)
          throw new AiError("AI_SESSION_REVISION_CONFLICT", "会话已变化，请重新读取");
        const edited = applySessionEdit(current.document, edit);
        this.assertOpen(ref.databaseName);
        await native.commitSession(lease, {
          sessionId: ref.sessionId,
          operationId: crypto.randomUUID(),
          expectedRevision,
          entries: edited.entries.slice(current.document.entries.length),
        });
        return this.snapshot(await this.readStored(ref));
      }),
  };

  readonly runs = {
    start: (request: AiRunStartRequest): Promise<AiRunHandle> =>
      this.startRun(request, () => this.runtime.start(request)),
    retryLast: (request: AiRetryRunRequest): Promise<AiRunHandle> =>
      this.startRun(request, () => this.runtime.retryLast(request)),
    subscribe: (...args: Parameters<AiRuntime["subscribe"]>) => {
      this.assertOpen();
      return this.runtime.subscribe(...args);
    },
    getSnapshot: (runId: string) => this.runtime.getSnapshot(runId),
    abort: (runId: string) => this.runtime.abort(runId),
    waitForIdle: (ref?: AiSessionRef) => this.runtime.waitForIdle(ref),
  };

  readonly generation = {
    start: (
      request: AiGenerationRequest,
      onSnapshot?: Parameters<AiRuntime["generate"]>[1]
    ): Promise<GenerationHandle> =>
      this.action(request.databaseName, async () => {
        this.assertOpen(request.databaseName);
        if (this.generations.has(request.requestId))
          throw new AiError("AI_RUN_ID_CONFLICT", "单次生成标识正在使用");
        try {
          this.assertOpen(request.databaseName);
          const handle = await this.runtime.generate(request, onSnapshot);
          const result = handle.result.finally(() => {
            this.generations.delete(request.requestId);
          });
          const wrapped = { ...handle, result };
          this.generations.set(request.requestId, {
            databaseName: request.databaseName,
            handle: wrapped,
          });
          this.actions.set(result, request.databaseName);
          void result.finally(() => this.actions.delete(result)).catch(() => undefined);
          void result.catch(() => undefined);
          return wrapped;
        } catch (error) {
          throw errorOf(error);
        }
      }),
  };

  readonly interactions = {
    resolveApproval: (input: Parameters<AiRuntime["resolveApproval"]>[0]) =>
      this.runtime.resolveApproval(input),
    answerQuestion: (input: Parameters<AiRuntime["answerQuestion"]>[0]) =>
      this.runtime.answerQuestion(input),
    requestQuestion: (...args: Parameters<AiRuntime["requestQuestion"]>) =>
      this.runtime.requestQuestion(...args),
  };

  readonly tools = {
    register: (
      spec: AiToolRegistrationSpec,
      execute: AiToolExecutor,
      scope?: { databaseName: string }
    ) => {
      this.assertOpen(scope?.databaseName);
      const owner = scope
        ? {
            databaseName: scope.databaseName,
            token: Symbol(),
            executionIdentity: spec.executionIdentity,
          }
        : undefined;
      const unregister = this.registry.register(spec, async (input, context) => {
        if (owner && owner.databaseName !== context.session.databaseName)
          throw new AiError("AI_LIBRARY_CHANGED", "工具不属于当前数据库");
        const lease = await this.assertExecution(context);
        const result = await execute(input, context);
        try {
          context.signal.throwIfAborted();
          await native.assertLibrary(lease);
        } catch (error) {
          if (spec.risk !== "read")
            throw new AiError(
              "AI_TOOL_OUTCOME_UNKNOWN",
              "工具返回时库身份已变化，写入结果未知，不能自动重放"
            );
          throw errorOf(error);
        }
        return result;
      });
      if (owner) this.toolScopes.set(spec.id, owner);
      else this.toolScopes.delete(spec.id);
      return this.own(() => {
        unregister();
        if (this.toolScopes.get(spec.id) === owner) this.toolScopes.delete(spec.id);
      }, scope?.databaseName);
    },
    list: () => {
      this.assertOpen();
      return this.registry.list();
    },
  };

  readonly skills = {
    registerSource: (source: AiSkillSource, scope?: { databaseName: string }) => {
      this.assertOpen(scope?.databaseName);
      return this.own(this.skillRegistry.registerSource(source), scope?.databaseName);
    },
    list: (signal?: AbortSignal) => {
      this.assertOpen();
      return this.skillRegistry.list(signal);
    },
    load: (...args: Parameters<AiSkillRegistry["load"]>) => {
      this.assertOpen();
      return this.skillRegistry.load(...args);
    },
    readResource: (...args: Parameters<AiSkillRegistry["readResource"]>) => {
      this.assertOpen();
      return this.skillRegistry.readResource(...args);
    },
  };

  readonly mcp = {
    subscribe: (databaseName: string, listener: () => void) => {
      this.assertOpen(databaseName);
      return this.mcpEntry(databaseName).manager.subscribe(listener);
    },
    list: (databaseName: string) => {
      return this.mcpEntries.get(databaseName)?.manager.list() ?? [];
    },
    connect: (databaseName: string, config: AiMcpServerConfig, options?: AiMcpConnectionOptions) =>
      this.action(databaseName, async () => {
        this.assertOpen(databaseName);
        const entry = this.mcpEntry(databaseName);
        await entry.manager.disconnect(config.id);
        await entry.contexts.get(config.id)?.dispose();
        entry.contexts.delete(config.id);
        if (config.transport.type === "stdio") return entry.manager.connect(config, options);
        const context = await native.createMcpFetch(await this.lease(databaseName), {
          id: config.id,
          transport: config.transport,
        });
        if (this.disposed || this.blocks.has(databaseName)) {
          await context.dispose();
          this.assertOpen(databaseName);
        }
        entry.contexts.set(config.id, context);
        try {
          return await entry.manager.connect(config, options);
        } catch (error) {
          if (entry.contexts.get(config.id) === context) entry.contexts.delete(config.id);
          await context.dispose();
          throw errorOf(error);
        }
      }),
    disconnect: async (databaseName: string, id: string) => {
      const entry = this.mcpEntries.get(databaseName);
      if (!entry) return;
      const context = entry.contexts.get(id);
      try {
        await entry.manager.disconnect(id);
      } finally {
        await context?.dispose();
        if (entry.contexts.get(id) === context) entry.contexts.delete(id);
      }
    },
    refreshTools: async (databaseName: string, id: string) => {
      this.assertOpen(databaseName);
      const entry = this.mcpEntries.get(databaseName);
      if (!entry) throw new AiError("AI_MCP_CONNECTION_FAILED", "MCP 尚未连接");
      return entry.manager.refreshTools(id);
    },
  };

  readonly lifecycle = {
    assertExecution: (context: AiToolExecutionContext) => this.assertExecution(context),
    suspend: () => this.suspend(),
    resume: async () => {
      const intent = ++this.pauseIntent;
      await this.suspendPromise;
      if (this.disposed) throw new AiError("AI_LIBRARY_CHANGED", "AI 服务已释放");
      if (intent === this.pauseIntent) this.paused = false;
    },
    releaseLibrary: (databaseName: string) => this.releaseLibrary(databaseName),
    prepareMaintenance: async (databaseName: string) => {
      this.assertOpen(databaseName);
      if (
        [...this.busy.keys()].some(key => (JSON.parse(key) as string[])[0] === databaseName) ||
        [...this.generations.values()].some(value => value.databaseName === databaseName) ||
        [...this.actions.values()].includes(databaseName)
      )
        throw new AiError("AI_LIBRARY_BUSY", "请先停止并等待本库操作完成");
      const unblock = this.block(databaseName);
      try {
        await this.releaseLibrary(databaseName, true);
        return unblock;
      } catch (error) {
        unblock();
        throw error;
      }
    },
    dispose: () => this.dispose(),
  };

  private assertOpen(databaseName?: string) {
    if (this.disposed) throw new AiError("AI_LIBRARY_CHANGED", "AI 服务已释放");
    if (this.paused) throw new AiError("AI_LIBRARY_BUSY", "应用在后台，AI 服务已暂停");
    if (databaseName && this.blocks.has(databaseName))
      throw new AiError("AI_LIBRARY_BUSY", "数据库正在释放或维护");
  }

  private block(databaseName: string) {
    this.blocks.set(databaseName, (this.blocks.get(databaseName) ?? 0) + 1);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const count = (this.blocks.get(databaseName) ?? 1) - 1;
      if (count) this.blocks.set(databaseName, count);
      else this.blocks.delete(databaseName);
    };
  }

  private own(dispose: () => void, databaseName?: string) {
    const release = () => {
      this.ownedRegistrations.delete(release);
      dispose();
    };
    this.ownedRegistrations.set(release, databaseName);
    return release;
  }

  private async lease(databaseName: string) {
    let promise = this.leases.get(databaseName);
    if (!promise) {
      promise = native.acquireLibrary(databaseName).catch(error => {
        this.leases.delete(databaseName);
        throw errorOf(error);
      });
      this.leases.set(databaseName, promise);
    }
    const lease = await promise;
    try {
      await native.assertLibrary(lease);
      return lease;
    } catch (error) {
      if (this.leases.get(databaseName) === promise) this.leases.delete(databaseName);
      throw errorOf(error);
    }
  }

  private async readStored(ref: AiSessionRef): Promise<AiStoredSession> {
    const lease = await this.lease(ref.databaseName);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "";
    let offset = 0;
    let first: native.NativeSessionChunk | undefined;
    try {
      for (;;) {
        const chunk = await native.readSession(lease, ref.sessionId, offset);
        first ??= chunk;
        if (first.revision !== chunk.revision || chunk.row.id !== ref.sessionId)
          throw new AiError("AI_SESSION_REVISION_CONFLICT", "会话读取期间发生变化");
        text += decoder.decode(decode(chunk.data), { stream: !chunk.eof });
        if (chunk.eof) break;
        if (chunk.nextOffset <= offset)
          throw new AiError("AI_STORAGE_FAILED", "会话读取游标未前进");
        offset = chunk.nextOffset;
      }
      const document = parseSessionFile(text);
      if (document.header.id !== ref.sessionId)
        throw new AiError("AI_SESSION_INVALID", "会话目录与文件身份不一致");
      return { document, row: first.row, revision: first.revision };
    } catch (error) {
      throw errorOf(error);
    }
  }

  private snapshot(stored: AiStoredSession): MobileAiSessionSnapshot {
    return {
      ...stored,
      messages: projectSessionMessages(stored.document),
      leafId: stored.document.entries.at(-1)?.id ?? null,
      formatVersion: stored.document.header.version,
    };
  }

  private async endActivity(lease: native.NativeLibraryLease, id: string, sessionId?: string) {
    try {
      await native.setRunActive(lease, id, false, sessionId);
    } catch (error) {
      const failure = errorOf(error);
      if (failure.code !== "AI_LIBRARY_CHANGED") throw failure;
    }
  }

  private async assertExecution(
    context: AiToolExecutionContext
  ): Promise<native.NativeLibraryLease> {
    context.signal.throwIfAborted();
    this.assertOpen(context.session.databaseName);
    const snapshot = this.runtime.getSnapshot(context.runId);
    if (
      !snapshot ||
      snapshot.status === "settled" ||
      keyOf(snapshot.session) !== keyOf(context.session)
    )
      throw new AiError("AI_TOOL_UNAVAILABLE", "工具执行不属于当前活动会话");
    const lease = await this.lease(context.session.databaseName);
    context.signal.throwIfAborted();
    return lease;
  }

  private suspend(): Promise<void> {
    this.pauseIntent++;
    if (this.disposed) return Promise.reject(new AiError("AI_LIBRARY_CHANGED", "AI 服务已释放"));
    this.paused = true;
    if (this.suspendPromise) return this.suspendPromise;
    const databases = new Set([
      ...this.leases.keys(),
      ...this.actions.values(),
      ...this.mcpEntries.keys(),
      ...this.contexts.keys(),
      ...[...this.busy.keys()].map(key => (JSON.parse(key) as string[])[0]),
      ...[...this.generations.values()].map(value => value.databaseName),
    ]);
    const promise = (async () => {
      const results = await Promise.allSettled(
        [...databases].map(name => this.releaseLibrary(name, true))
      );
      const failed = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (failed) throw errorOf(failed.reason);
    })();
    this.suspendPromise = promise;
    void promise
      .finally(() => {
        if (this.suspendPromise === promise) this.suspendPromise = undefined;
      })
      .catch(() => undefined);
    return promise;
  }

  private action<T>(databaseName: string, apply: () => Promise<T>): Promise<T> {
    const promise = apply();
    this.actions.set(promise, databaseName);
    void promise.finally(() => this.actions.delete(promise)).catch(() => undefined);
    return promise;
  }

  private async startRun(
    request: Pick<AiRunStartRequest, "runId" | "session" | "toolIds">,
    start: () => Promise<AiRunHandle>
  ): Promise<AiRunHandle> {
    this.assertOpen(request.session.databaseName);
    const specs = new Map(this.registry.list().map(spec => [spec.id, spec]));
    for (const id of request.toolIds) {
      const owner = this.toolScopes.get(id);
      if (
        owner &&
        owner.executionIdentity === specs.get(id)?.executionIdentity &&
        owner.databaseName !== request.session.databaseName
      )
        throw new AiError("AI_LIBRARY_CHANGED", "所选工具不属于当前数据库");
    }
    const key = keyOf(request.session);
    const existing = this.busy.get(key);
    if (existing && (existing.kind !== "run" || existing.id !== request.runId))
      throw new AiError("AI_SESSION_BUSY", "当前会话正在执行其他操作");
    const owner = existing ?? { kind: "run" as const, id: request.runId };
    this.busy.set(key, owner);
    try {
      const handle = await start();
      void handle.result
        .finally(() => {
          if (this.busy.get(key) === owner) this.busy.delete(key);
          this.skillSnapshots.delete(request.runId);
        })
        .catch(() => undefined);
      return handle;
    } catch (error) {
      if (!existing && this.busy.get(key) === owner) this.busy.delete(key);
      if (!existing) this.skillSnapshots.delete(request.runId);
      throw errorOf(error);
    }
  }

  private async mutate<T>(
    ref: AiSessionRef,
    apply: (lease: native.NativeLibraryLease) => Promise<T>
  ): Promise<T> {
    this.assertOpen(ref.databaseName);
    const key = keyOf(ref);
    if (this.busy.has(key)) throw new AiError("AI_SESSION_BUSY", "当前会话正在执行其他操作");
    const owner = { kind: "mutation" as const, id: crypto.randomUUID() };
    this.busy.set(key, owner);
    return this.action(ref.databaseName, async () => {
      let lease: native.NativeLibraryLease | undefined;
      let active = false;
      try {
        lease = await this.lease(ref.databaseName);
        this.assertOpen(ref.databaseName);
        await native.setRunActive(lease, owner.id, true);
        active = true;
        this.assertOpen(ref.databaseName);
        return await apply(lease);
      } catch (error) {
        throw errorOf(error);
      } finally {
        try {
          if (active && lease) await this.endActivity(lease, owner.id);
        } finally {
          if (this.busy.get(key) === owner) this.busy.delete(key);
        }
      }
    });
  }

  private async modelConfig(): Promise<AiModelConfig> {
    this.assertOpen();
    let value: Awaited<ReturnType<typeof native.getModelConfig>>;
    try {
      value = await native.getModelConfig();
    } catch (error) {
      throw errorOf(error);
    }
    return this.publicConfig(value);
  }

  private publicConfig(value: Awaited<ReturnType<typeof native.getModelConfig>>): AiModelConfig {
    if (!Array.isArray(value.llmProviders))
      throw new AiError("AI_MODEL_UNAVAILABLE", "模型配置无效");
    const providers = value.llmProviders.map(provider => {
      if (
        !knownRecord(provider) ||
        typeof provider.id !== "string" ||
        typeof provider.baseUrl !== "string" ||
        !Array.isArray(provider.models)
      )
        throw new AiError("AI_MODEL_UNAVAILABLE", "模型提供方配置无效");
      const publicProvider = structuredClone(provider);
      delete publicProvider.apiKey;
      return publicProvider as unknown as AiPublicProvider;
    });
    return {
      llmProviders: providers,
      llmUsageSettings: (value.llmUsageSettings ?? {}) as AiModelConfig["llmUsageSettings"],
    };
  }

  private async resolveModel(
    ref: AiModelRef,
    session: AiSessionRef,
    expectedModelRevision?: string
  ): Promise<AiResolvedModel> {
    const lease = await this.lease(session.databaseName);
    let context: Awaited<ReturnType<typeof native.createModelFetch>>;
    try {
      context = await native.createModelFetch(
        lease,
        ref.providerId,
        ref.modelId,
        expectedModelRevision
      );
    } catch (error) {
      throw errorOf(error);
    }
    if (this.disposed || this.blocks.has(session.databaseName)) {
      await context.dispose();
      throw new AiError("AI_LIBRARY_CHANGED", "模型准备期间库或服务已释放");
    }
    let configured: ReturnType<typeof resolveConfiguredModel>;
    try {
      configured = resolveConfiguredModel(this.publicConfig(context.config), ref);
    } catch (error) {
      await context.dispose();
      throw error;
    }
    const contexts = this.contexts.get(session.databaseName) ?? new Set<NativeContext>();
    contexts.add(context);
    this.contexts.set(session.databaseName, contexts);
    return {
      model: configured.model,
      fetch: context.fetch,
      stripThinkTags: configured.setting.stripThinkTags,
      defaultThinkingLevel: configured.setting.thinkingLevel,
      dispose: async () => {
        contexts.delete(context);
        await context.dispose();
      },
    };
  }

  private async skillSnapshot(request: AiRunStartRequest, signal: AbortSignal) {
    let snapshot = this.skillSnapshots.get(request.runId);
    if (!snapshot) {
      snapshot = await this.skillRegistry.captureAvailable(request.skillIds, signal);
      this.skillSnapshots.set(request.runId, snapshot);
    }
    return snapshot;
  }

  private async prepareTools(
    request: AiRunStartRequest,
    signal: AbortSignal,
    base: AiToolSnapshot
  ) {
    for (const spec of base.specs) {
      const owner = this.toolScopes.get(spec.id);
      if (
        owner?.executionIdentity === spec.executionIdentity &&
        owner.databaseName !== request.session.databaseName
      )
        throw new AiError("AI_LIBRARY_CHANGED", "所选工具不属于当前数据库");
    }
    if (!request.toolIds.length) return { snapshot: base };
    const skills = await this.skillSnapshot(request, signal);
    if (!skills.skills.length)
      return {
        snapshot: base,
        dispose: () => {
          this.skillSnapshots.delete(request.runId);
        },
      };
    const local = new AiToolRegistry();
    const registrations = createSkillTools(skills);
    for (const { spec } of registrations)
      if (base.specs.some(value => value.name === spec.name || value.id === spec.id))
        throw new AiError("AI_TOOL_ARGUMENT_INVALID", "所选工具与技能辅助工具名称冲突");
    const release = registrations.map(value => local.register(value.spec, value.execute));
    const captured = local.capture(registrations.map(value => value.spec.id));
    const localIds = new Set(captured.specs.map(value => value.id));
    return {
      snapshot: {
        specs: Object.freeze([...base.specs, ...captured.specs]),
        isCurrent: () => base.isCurrent() && skills.isCurrent() && captured.isCurrent(),
        execute: (id, input, context, options) =>
          localIds.has(id)
            ? captured.execute(id, input, context, options)
            : base.execute(id, input, context, options),
      } satisfies AiToolSnapshot,
      dispose: () => {
        for (const dispose of release) dispose();
        this.skillSnapshots.delete(request.runId);
      },
    };
  }

  private async preparePrompt(request: AiRunStartRequest, signal: AbortSignal) {
    if (!request.toolIds.length && !request.skillIds.length)
      return { sections: { "tau-skills": null } };
    const snapshot = await this.skillSnapshot(request, signal);
    const sections: string[] = [];
    if (request.toolIds.length && snapshot.skills.length)
      sections.push(`可用技能，使用 load_skill 按需读取：\n${formatSkillCatalog(snapshot.skills)}`);
    for (const id of request.skillIds) {
      const skill = await snapshot.load(id, signal);
      sections.push(`技能 ${skill.name}：\n${skill.instructions}`);
    }
    return { sections: { "tau-skills": sections.length ? sections.join("\n\n") : null } };
  }

  private mcpEntry(databaseName: string) {
    let entry = this.mcpEntries.get(databaseName);
    if (!entry) {
      const contexts = new Map<string, NativeContext>();
      const executionLeases = new WeakMap<AiToolExecutionContext, native.NativeLibraryLease>();
      const manager = new AiMcpManager(this.registry, {
        fetch: async () => {
          throw new AiError("AI_TRANSPORT_FAILED", "MCP 缺少原生网络上下文");
        },
        fetchForServer: config => {
          const context = contexts.get(config.id);
          if (!context) throw new AiError("AI_TRANSPORT_FAILED", "MCP 原生网络上下文已释放");
          return context.fetch;
        },
        validateContext: async (_config, context) => {
          if (context.session.databaseName !== databaseName)
            throw new AiError("AI_LIBRARY_CHANGED", "MCP 服务不属于当前数据库");
          const previous = executionLeases.get(context);
          if (previous) {
            executionLeases.delete(context);
            context.signal.throwIfAborted();
            try {
              await native.assertLibrary(previous);
            } catch {
              throw new AiError("AI_TOOL_OUTCOME_UNKNOWN", "MCP 返回时库身份已变化，执行结果未知");
            }
          } else executionLeases.set(context, await this.assertExecution(context));
        },
      });
      const token = Symbol();
      const scopeIds = new Set<string>();
      const clearScopes = () => {
        for (const id of scopeIds)
          if (this.toolScopes.get(id)?.token === token) this.toolScopes.delete(id);
        scopeIds.clear();
      };
      const unsubscribe = manager.subscribe(() => {
        clearScopes();
        const specs = new Map(this.registry.list().map(spec => [spec.id, spec]));
        for (const state of manager.list())
          for (const id of state.toolIds) {
            const spec = specs.get(id);
            if (spec) {
              this.toolScopes.set(id, {
                databaseName,
                token,
                executionIdentity: spec.executionIdentity,
              });
              scopeIds.add(id);
            }
          }
      });
      entry = {
        manager,
        contexts,
        releaseScope() {
          unsubscribe();
          clearScopes();
        },
      };
      this.mcpEntries.set(databaseName, entry);
    }
    return entry;
  }

  private releaseLibrary(databaseName: string, keepRegistrations = false): Promise<void> {
    const previous = this.releases.get(databaseName);
    if (previous)
      return keepRegistrations
        ? previous
        : previous.finally(() => this.dropLibraryRegistrations(databaseName));
    const unblock = this.block(databaseName);
    const result = (async () => {
      let failure: unknown;
      const attempt = async (apply: () => void | Promise<unknown>) => {
        try {
          await apply();
        } catch (error) {
          failure ??= error;
        }
      };
      try {
        await attempt(() => this.runtime.releaseLibrary(databaseName));
        const generations = [...this.generations.values()].filter(
          value => value.databaseName === databaseName
        );
        for (const { handle } of generations) await attempt(() => handle.abort());
        const entry = this.mcpEntries.get(databaseName);
        if (entry) {
          await attempt(() => entry.manager.dispose());
          await Promise.all(
            [...entry.contexts.values()].map(context => attempt(() => context.dispose()))
          );
          entry.releaseScope();
        }
        this.mcpEntries.delete(databaseName);
        await Promise.allSettled(generations.map(value => value.handle.result));
        await Promise.allSettled(
          [...this.actions].filter(([, name]) => name === databaseName).map(([action]) => action)
        );
        for (const [dispose, scope] of this.ownedRegistrations)
          if (!keepRegistrations && scope === databaseName) await attempt(dispose);
        const contexts = this.contexts.get(databaseName);
        this.contexts.delete(databaseName);
        if (contexts)
          await Promise.all([...contexts].map(context => attempt(() => context.dispose())));
        const promise = this.leases.get(databaseName);
        if (promise) {
          const lease = await promise.catch(() => undefined);
          if (lease)
            await attempt(async () => {
              try {
                await native.releaseLibrary(lease);
                if (this.leases.get(databaseName) === promise) this.leases.delete(databaseName);
              } catch (error) {
                const failure = errorOf(error);
                if (failure.code !== "AI_LIBRARY_CHANGED") throw failure;
                if (this.leases.get(databaseName) === promise) this.leases.delete(databaseName);
              }
            });
        }
        if (failure) throw errorOf(failure);
      } finally {
        unblock();
        this.releases.delete(databaseName);
      }
    })();
    this.releases.set(databaseName, result);
    return result;
  }

  private dropLibraryRegistrations(databaseName: string) {
    let failure: unknown;
    for (const [dispose, scope] of this.ownedRegistrations)
      if (scope === databaseName) {
        try {
          dispose();
        } catch (error) {
          failure ??= error;
        }
      }
    if (failure) throw errorOf(failure);
  }

  private dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.disposePromise = (async () => {
      const results = await Promise.allSettled([
        this.runtime.dispose(),
        ...[...this.leases.keys()].map(name => this.releaseLibrary(name)),
      ]);
      try {
        for (const dispose of this.ownedRegistrations.keys()) dispose();
      } finally {
        this.skillSnapshots.clear();
      }
      const failed = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (failed) throw errorOf(failed.reason);
    })();
    return this.disposePromise;
  }
}

export const createMobileAiService = (options?: MobileAiOptions) => new MobileAiService(options);
