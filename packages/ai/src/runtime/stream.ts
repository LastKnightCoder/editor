import {
  createAssistantMessageEventStream,
  createModels,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import { createModelRequestProvider, streamModelRequest } from "../model-request";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { rewriteThinkTagStream } from "../think-stream";

export function createModelStream(
  fetch: typeof globalThis.fetch,
  stripThinkTags = false,
  limits: { maxTokens?: number; temperature?: number } = {}
): StreamFn {
  const models = createModels();
  return (model, context, options) => {
    const request = {
      ...options,
      ...(limits.maxTokens === undefined
        ? {}
        : { maxTokens: Math.min(limits.maxTokens, model.maxTokens) }),
      ...(limits.temperature === undefined ? {} : { temperature: limits.temperature }),
      fetch,
      apiKey: "native-managed",
      maxRetries: options?.maxRetries ?? 2,
    };
    models.setProvider(
      createModelRequestProvider({
        id: model.provider,
        models: [model],
        auth: {
          apiKey: {
            name: "宿主托管凭据",
            resolve: async () => ({ auth: { apiKey: "native-managed" }, source: "host" }),
          },
        },
      })
    );
    const source = streamModelRequest(models, model, context, request);
    if (!stripThinkTags) return source;
    const output = createAssistantMessageEventStream();
    void (async () => {
      let last: AssistantMessage | undefined;
      try {
        for await (const event of rewriteThinkTagStream(source)) {
          if ("partial" in event) last = event.partial;
          output.push(event);
        }
      } catch (error) {
        const reason = options?.signal?.aborted ? "aborted" : "error";
        output.push({
          type: "error",
          reason,
          error: {
            role: "assistant",
            content: last?.content ?? [],
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: last?.usage ?? {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            timestamp: Date.now(),
            stopReason: reason,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        output.end();
      }
    })();
    return output;
  };
}
