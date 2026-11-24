import {
  createProvider,
  getOpenCodeSessionHeaders,
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type CreateProviderOptions,
  type Model,
  type Models,
  type ModelsSimpleStreamOptions,
  type ProviderStreams,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import * as anthropic from "@earendil-works/pi-ai/api/anthropic-messages";
import * as completions from "@earendil-works/pi-ai/api/openai-completions";
import * as responses from "@earendil-works/pi-ai/api/openai-responses";
import type { PiApiKind } from "./models";

export interface ModelTaskIdentity {
  routingId: string;
}

/** 在逻辑任务创建时绑定；传输重试和任务内的多次调用复用它。 */
export function createModelTaskIdentity(
  routingId: string = crypto.randomUUID()
): ModelTaskIdentity {
  if (!routingId.trim() || routingId.length > 128 || /[^\x21-\x7e]/.test(routingId))
    throw new Error("模型路由标识必须是 1–128 个可打印 ASCII 字符");
  return { routingId };
}

export async function createScopedModelTaskIdentity(scope: readonly string[]) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(scope))
  );
  const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(
    ""
  );
  return createModelTaskIdentity(`tau-${id}`);
}

export function prepareModelRequestOptions<T extends StreamOptions>(model: Model<Api>, options: T) {
  const sessionId = createModelTaskIdentity(options.sessionId).routingId;
  const routingHeaders = getOpenCodeSessionHeaders(model, sessionId);
  for (const name of Object.keys(options.headers ?? {})) {
    if (routingHeaders && name.toLowerCase() === "x-opencode-session")
      delete routingHeaders["x-opencode-session"];
  }
  return {
    ...options,
    sessionId,
    headers: { ...routingHeaders, ...options.headers },
    identity: { userAgent: { custom: "Tau" }, ...options.identity },
    timeoutMs: options.timeoutMs ?? 300_000,
    maxRetries: options.maxRetries ?? 0,
    maxRetryDelayMs: options.maxRetryDelayMs ?? 60_000,
  };
}

function withRequestDefaults(streams: ProviderStreams): ProviderStreams {
  return {
    ...streams,
    stream: (model, context, options) =>
      streams.stream(model, context, prepareModelRequestOptions(model, options ?? {})),
    streamSimple: (model, context, options) =>
      streams.streamSimple(model, context, prepareModelRequestOptions(model, options ?? {})),
  };
}

const API_STREAMS: Record<PiApiKind, ProviderStreams> = {
  "openai-completions": withRequestDefaults(completions),
  "openai-responses": withRequestDefaults(responses),
  "anthropic-messages": withRequestDefaults(anthropic),
};

/** 会话宿主与单发只提供模型和认证；协议、路由与执行默认值在这里装配。 */
export function createModelRequestProvider(input: Omit<CreateProviderOptions, "api">) {
  return createProvider({ ...input, api: API_STREAMS });
}

export function streamModelRequest(
  models: Models,
  model: Model<Api>,
  context: Context,
  options: ModelsSimpleStreamOptions = {}
) {
  return models.streamSimple(model, context, prepareModelRequestOptions(model, options));
}

export async function collectModelStream(
  stream: AsyncIterable<AssistantMessageEvent>,
  signal?: AbortSignal,
  onEvent?: (event: AssistantMessageEvent) => void
) {
  let message: AssistantMessage | null = null;
  let error: string | undefined;
  let aborted = signal?.aborted === true;
  try {
    for await (const event of stream) {
      if (event.type === "done") message = event.message;
      if (event.type === "error") {
        aborted ||= event.reason === "aborted";
        error = event.error.errorMessage ?? "模型请求失败";
      }
      onEvent?.(event);
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  aborted ||= signal?.aborted === true;
  if (!aborted && !error && !message) error = "模型流未返回完成结果";
  return {
    outcome: aborted ? ("aborted" as const) : error ? ("failed" as const) : ("completed" as const),
    message: aborted || error ? null : message,
    ...(error ? { error } : {}),
  };
}
