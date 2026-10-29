import { invoke } from "@tauri-apps/api/core";
import type {
  PluginAICapability,
  PluginAICapabilityClient,
  PluginAIEvent,
  PluginAIFeature,
  PluginAIFeatures,
  PluginAIRequest,
  PluginAIResult,
} from "@tau/plugins";
import type { AiModelRef } from "@tau/ai/contracts";
import type { MobileAiService } from "../../services/ai";

export interface MobilePluginAIConfig {
  enabled: boolean;
  dailyRequests: number;
  dailyTokens: number;
  concurrency: number;
  assignments: Record<string, AiModelRef | null>;
}
export interface MobilePluginAIInfo {
  id: string;
  name: string;
  features: PluginAIFeature[];
  hostFeatures?: PluginAICapability[];
  config: MobilePluginAIConfig;
}
export interface MobilePluginAIRunning {
  requestId: string;
  pluginId: string;
  pluginName: string;
  featureName: string;
  startedAt: number;
  hostFeature?: PluginAICapability;
}
export interface MobilePluginAIUsage {
  quota: { day: string; requests: number; tokens: number };
  requests: Array<{
    requestId: string;
    database: string;
    pluginId: string;
    feature: string;
    providerId: string;
    modelId: string;
    pluginName: string;
    featureName: string;
    hostFeature?: PluginAICapability | null;
    startedAt: number;
    reservedTokens: number;
    status: string;
    usage: PluginAIResult["usage"];
    usageKnown: boolean;
    chargedTokens: number;
    error: string | null;
  }>;
  total: number;
  nextOffset: number;
  hasMore: boolean;
}
interface Options {
  databaseName: string;
  token: string;
  ai():
    | Pick<MobileAiService, "models" | "generation">
    | Promise<Pick<MobileAiService, "models" | "generation">>;
  openSettings?(pluginId: string, feature?: string): void;
  call?<T>(command: string, args: Record<string, unknown>): Promise<T>;
}
type Reference = { model: AiModelRef; revision: string };
type Binding = { pluginId: string; signal: AbortSignal; close(): Promise<void> };
type Task = { pluginId: string; controller: AbortController; result: Promise<PluginAIResult> };

function validateRequest(input: Omit<PluginAIRequest, "signal">) {
  if (
    !input ||
    !Array.isArray(input.messages) ||
    !input.messages.length ||
    input.messages.length > 200 ||
    input.messages.some(
      message =>
        !message ||
        !["system", "user", "assistant"].includes(message.role) ||
        typeof message.content !== "string"
    ) ||
    input.messages.reduce((size, message) => size + message.content.length, 0) > 500_000 ||
    (input.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens <= 0))
  )
    throw new Error("AI_INVALID_REQUEST：消息无效或过长");
  if ([...input.messages].reverse().find(message => message.role !== "system")?.role !== "user")
    throw new Error("AI_INVALID_REQUEST：单次生成必须以用户消息结束");
  let encodedSize = 0;
  for (const message of input.messages) {
    if (!("images" in message) || message.images === undefined) continue;
    if (message.role !== "user" || !Array.isArray(message.images) || message.images.length > 10)
      throw new Error("AI_INVALID_REQUEST：图片参数无效");
    for (const image of message.images) {
      if (!image || typeof image.data !== "string")
        throw new Error("AI_INVALID_REQUEST：图片参数无效");
      encodedSize += image.data.length;
      if (
        encodedSize > 20 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(image.mimeType) ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
      )
        throw new Error("AI_INVALID_REQUEST：图片格式无效或过大");
    }
  }
}

function publicError(error: unknown): Error {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  // 原生协议错误可交付；模型与网络的原始错误可能携带鉴权或请求内容。
  return new Error(
    /^AI_[A-Z_]+(?:：|:|$)/.test(message)
      ? message
      : "AI_REQUEST_FAILED：模型请求失败，请检查服务商配置"
  );
}

export function createMobilePluginAI(options: Options) {
  const controller = new AbortController();
  const bindings = new Map<string, Binding>();
  const tasks = new Map<string, Task>();
  let disposal: Promise<void> | undefined;
  const call = <T>(command: string, args: Record<string, unknown> = {}) =>
    (options.call ?? invoke)<T>(command, {
      token: options.token,
      database: options.databaseName,
      ...args,
    });
  const assertOpen = () => controller.signal.throwIfAborted();
  const cancelTasks = (pluginId?: string, requestId?: string) => {
    for (const [id, task] of tasks)
      if ((!pluginId || task.pluginId === pluginId) && (!requestId || id === requestId))
        task.controller.abort();
  };

  const adapter = {
    async bindCapability(
      plugin: { id: string; name: string },
      capability: PluginAICapability,
      lifetime: AbortSignal
    ): Promise<PluginAICapabilityClient> {
      const client = await bind(plugin, [], lifetime, capability);
      return {
        chat: request => client.chat({ ...request, feature: capability }),
        stream: request => client.stream({ ...request, feature: capability }),
      };
    },
    bind: (
      plugin: { id: string; name: string },
      features: readonly PluginAIFeature[],
      lifetime: AbortSignal
    ) => bind(plugin, features, lifetime),
  };

  async function bind(
    plugin: { id: string; name: string },
    features: readonly PluginAIFeature[],
    lifetime: AbortSignal,
    hostFeature?: PluginAICapability
  ): Promise<PluginAIFeatures> {
    const signal = AbortSignal.any([controller.signal, lifetime]);
    signal.throwIfAborted();
    const session = await call<string>("plugin_ai_register", {
      plugin: { ...plugin },
      features: structuredClone(features),
      hostFeature: hostFeature ?? null,
    });
    let closed: Promise<void> | undefined;
    const close = () => {
      closed ??= call<void>("plugin_ai_unregister", { session }).finally(() => {
        bindings.delete(session);
        signal.removeEventListener("abort", onAbort);
      });
      return closed;
    };
    const onAbort = () => {
      void close().catch(() => undefined);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    bindings.set(session, { pluginId: plugin.id, signal, close });
    if (signal.aborted) {
      await close().catch(() => undefined);
      signal.throwIfAborted();
    }

    async function* stream(request: PluginAIRequest): AsyncGenerator<PluginAIEvent> {
      const { signal: callerSignal, ...value } = request;
      const input = structuredClone(value);
      validateRequest(input);
      const local = new AbortController();
      const execution = AbortSignal.any([
        signal,
        local.signal,
        ...(callerSignal ? [callerSignal] : []),
      ]);
      execution.throwIfAborted();
      const requestId = crypto.randomUUID();
      const queue: string[] = [];
      let wake: (() => void) | undefined;
      let ended = false;
      let result: PluginAIResult | undefined;
      let failure: unknown;
      const stop = () => wake?.();
      execution.addEventListener("abort", stop, { once: true });
      const pending = execute(session, requestId, input, execution, text => {
        if (!execution.aborted && text) {
          queue.push(text);
          wake?.();
        }
      })
        .then(
          value => {
            result = value;
          },
          error => {
            failure = error;
          }
        )
        .finally(() => {
          ended = true;
          tasks.delete(requestId);
          wake?.();
        });
      const taskResult = pending.then(() => {
        if (failure) throw failure;
        if (!result) throw new Error("AI_REQUEST_FAILED");
        return result;
      });
      tasks.set(requestId, { pluginId: plugin.id, controller: local, result: taskResult });
      void taskResult.catch(() => undefined);
      try {
        while (!ended || queue.length) {
          execution.throwIfAborted();
          const text = queue.shift();
          if (text !== undefined) yield { type: "text", delta: text };
          else if (!ended)
            await new Promise<void>(resolve => {
              wake = resolve;
            });
        }
        execution.throwIfAborted();
        if (failure) throw failure;
        if (!result) throw new Error("AI_REQUEST_FAILED");
        yield { type: "done", result };
      } finally {
        local.abort();
        execution.removeEventListener("abort", stop);
        await pending;
      }
    }
    return {
      getStatus: feature => {
        signal.throwIfAborted();
        return call<{ configured: boolean; enabled: boolean }>("plugin_ai_status", {
          session,
          feature,
        }).then(value => {
          signal.throwIfAborted();
          return value;
        });
      },
      openSettings: feature => {
        signal.throwIfAborted();
        if (!options.openSettings)
          throw new Error("AI_SETTINGS_UNAVAILABLE：当前移动宿主尚未提供 AI 配置界面");
        options.openSettings(plugin.id, feature);
      },
      stream,
      async chat(request) {
        for await (const event of stream(request)) if (event.type === "done") return event.result;
        throw new Error("AI_REQUEST_FAILED");
      },
    };
  }

  async function execute(
    session: string,
    requestId: string,
    input: Omit<PluginAIRequest, "signal">,
    signal: AbortSignal,
    delta: (text: string) => void
  ): Promise<PluginAIResult> {
    let started = false;
    let generationStarted = false;
    let handle: Awaited<ReturnType<MobileAiService["generation"]["start"]>> | undefined;
    let status: "ok" | "error" | "aborted" = "error";
    let usage: PluginAIResult["usage"] = null;
    let result: PluginAIResult | undefined;
    let failure: Error | undefined;
    let settlement: { accepted: boolean; error?: string } | undefined;
    const abort = () => handle?.abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      const reference = await call<Reference>("plugin_ai_prepare", {
        session,
        feature: input.feature,
      });
      signal.throwIfAborted();
      const ai = await options.ai();
      const model = await ai.models.resolve(reference.model);
      signal.throwIfAborted();
      if (
        input.messages.some(message => message.role === "user" && message.images?.length) &&
        !model.model.input.includes("image")
      )
        throw new Error("AI_INVALID_REQUEST：所选模型不支持图片输入");
      const authorized = await call<{
        model: AiModelRef;
        maxOutputTokens: number;
        modelRevision: string;
      }>("plugin_ai_begin", {
        session,
        requestId,
        input: { feature: input.feature, maxOutputTokens: input.maxOutputTokens ?? null },
        reference,
        capacity: { contextWindow: model.model.contextWindow, maxTokens: model.model.maxTokens },
      });
      started = true;
      if (!/^[a-f0-9]{64}$/.test(authorized.modelRevision ?? ""))
        throw new Error("AI_CONFIG_CHANGED：原生模型授权缺少有效配置指纹");
      signal.throwIfAborted();
      let emitted = "";
      handle = await ai.generation.start(
        {
          requestId,
          databaseName: options.databaseName,
          model: authorized.model,
          expectedModelRevision: authorized.modelRevision,
          maxOutputTokens: authorized.maxOutputTokens,
          system: input.messages
            .filter(message => message.role === "system")
            .map(message => message.content)
            .join("\n\n"),
          messages: input.messages
            .filter(message => message.role !== "system")
            .map(message =>
              message.role === "user"
                ? {
                    role: "user",
                    content: message.content,
                    ...(message.images ? { images: [...message.images] } : {}),
                  }
                : { role: "assistant", content: message.content }
            ),
        },
        response => {
          if (signal.aborted) return;
          if (response.content.startsWith(emitted)) {
            delta(response.content.slice(emitted.length));
            emitted = response.content;
          }
        }
      );
      generationStarted = true;
      if (signal.aborted) handle.abort();
      const outcome = await handle.result;
      const value = outcome.response?.usage;
      if (
        value &&
        [value.inputTokens, value.outputTokens].every(
          count => Number.isSafeInteger(count) && count >= 0
        ) &&
        value.inputTokens + value.outputTokens > 0
      )
        usage = {
          inputTokens: value.inputTokens,
          outputTokens: value.outputTokens,
          totalTokens: value.inputTokens + value.outputTokens,
        };
      signal.throwIfAborted();
      if (outcome.outcome === "aborted") {
        status = "aborted";
        throw new Error("AI_ABORTED：请求已取消");
      }
      if (outcome.error?.code === "AI_CONFIG_CHANGED") {
        usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
        throw new Error("AI_CONFIG_CHANGED：模型配置已改变，请重试");
      }
      if (outcome.outcome !== "completed" || !outcome.response)
        throw new Error("AI_REQUEST_FAILED：模型请求失败，请检查服务商配置");
      const text = outcome.response.content;
      status = "ok";
      result = { text, usage };
    } catch (error) {
      if (signal.aborted) {
        status = "aborted";
        failure = new Error("AI_ABORTED：请求已取消");
      } else failure = publicError(error);
    } finally {
      signal.removeEventListener("abort", abort);
      if (started) {
        if (!generationStarted) usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
        try {
          settlement = await call<{ accepted: boolean; error?: string }>("plugin_ai_finish", {
            session,
            requestId,
            status,
            usage,
          });
        } catch (error) {
          failure = publicError(error);
        }
      }
    }
    if (failure) throw failure;
    signal.throwIfAborted();
    if (!settlement?.accepted)
      throw publicError(settlement?.error ?? "AI_CONFIG_CHANGED：授权或模型配置已变化");
    if (!result) throw new Error("AI_REQUEST_FAILED");
    return result;
  }

  return {
    adapter,
    info(pluginId: string) {
      assertOpen();
      return call<MobilePluginAIInfo | null>("plugin_ai_info", { pluginId });
    },
    async configure(pluginId: string, config: MobilePluginAIConfig) {
      assertOpen();
      await call<void>("plugin_ai_configure", { pluginId, config: structuredClone(config) });
      cancelTasks(pluginId);
    },
    running() {
      assertOpen();
      return call<MobilePluginAIRunning[]>("plugin_ai_running");
    },
    usage(pluginId: string, page: { offset?: number; limit?: number } = {}) {
      assertOpen();
      return call<MobilePluginAIUsage>("plugin_ai_usage", {
        pluginId,
        offset: page.offset ?? 0,
        limit: page.limit ?? 30,
      });
    },
    async cancel(requestId: string) {
      assertOpen();
      cancelTasks(undefined, requestId);
      await call<void>("plugin_ai_cancel", { requestId, pluginId: null });
    },
    async revoke(pluginId: string) {
      assertOpen();
      cancelTasks(pluginId);
      await call<void>("plugin_ai_revoke", { pluginId });
    },
    dispose() {
      if (disposal) return disposal;
      controller.abort();
      cancelTasks();
      disposal = Promise.allSettled([...tasks.values()].map(task => task.result)).then(async () => {
        await Promise.allSettled([...bindings.values()].map(binding => binding.close()));
      });
      return disposal;
    },
  };
}
export type MobilePluginAI = ReturnType<typeof createMobilePluginAI>;
