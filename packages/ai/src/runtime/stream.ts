import {
  createAssistantMessageEventStream,
  type AssistantMessageEventStream,
  type Api,
  type Model,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import { streamSimple as completions } from "@earendil-works/pi-ai/api/openai-completions";
import { streamSimple as responses } from "@earendil-works/pi-ai/api/openai-responses";
import { streamSimple as anthropic } from "@earendil-works/pi-ai/api/anthropic-messages";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { AiError } from "../contracts";
import { rewriteThinkTagStream } from "../think-stream";

export function createModelStream(
  fetch: typeof globalThis.fetch,
  stripThinkTags = false,
  limits: { maxTokens?: number; temperature?: number } = {}
): StreamFn {
  return (model, context, options) => {
    const request = {
      ...options,
      ...(limits.maxTokens === undefined
        ? {}
        : { maxTokens: Math.min(limits.maxTokens, model.maxTokens) }),
      ...(limits.temperature === undefined ? {} : { temperature: limits.temperature }),
      fetch,
      apiKey: "native-managed",
      maxRetries: 2,
    };
    let source: AssistantMessageEventStream;
    switch (model.api) {
      case "openai-completions":
        source = completions(model as Model<"openai-completions">, context, request);
        break;
      case "openai-responses":
        source = responses(model as Model<"openai-responses">, context, request);
        break;
      case "anthropic-messages":
        source = anthropic(model as Model<"anthropic-messages">, context, request);
        break;
      default:
        throw new AiError("AI_MODEL_UNAVAILABLE", `不支持的模型协议：${(model as Model<Api>).api}`);
    }
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
