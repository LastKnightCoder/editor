import {
  collectModelStream,
  createModelTaskIdentity,
  createScopedModelTaskIdentity,
  streamModelRequest,
} from "@tau/ai/model-request";
import { normalizeContext, type AssistantMessageEvent } from "@earendil-works/pi-ai";
import { buildSingleShotContext, type ProviderRegistry } from "./pi-ai-runtime-core";
import { createStreamUsageTracker, type RecordUsage } from "./model-usage/trackers";
import { rewriteThinkTagStream } from "./think-stream-rewriter";
import type { PiSingleShotRequest } from "@/types/pi-llm";

export async function executeSingleShot(
  registry: ProviderRegistry,
  request: PiSingleShotRequest,
  record: RecordUsage,
  signal?: AbortSignal,
  onEvent?: (event: AssistantMessageEvent) => void
) {
  const model = registry.resolveModel(request.providerId, request.modelId);
  if (!model)
    return {
      ok: false,
      message: null,
      error: registry.describeUnregisteredModel(request.providerId, request.modelId),
    };
  const source = request.source;
  const task = request.task
    ? createModelTaskIdentity(request.task.routingId)
    : source?.entityId && source.library
      ? await createScopedModelTaskIdentity([
          source.library,
          source.pluginId ?? "host",
          source.feature ?? "unknown",
          source.entityId,
        ])
      : createModelTaskIdentity(request.requestId || undefined);
  const usage = createStreamUsageTracker(
    {
      ...source,
      providerId: request.providerId,
      modelId: request.modelId,
      feature: source?.feature || "unknown",
      scope: null,
      sessionId: null,
      routingId: task.routingId,
      entityId: source?.entityId ?? null,
      library: source?.library ?? null,
      customCost: registry.hasCustomCost(request.providerId, request.modelId),
    },
    record
  );
  const thinking =
    request.thinking ?? registry.defaultThinking(request.providerId, request.modelId);
  const stream = streamModelRequest(
    registry.models,
    model,
    normalizeContext(buildSingleShotContext(request, request.providerId, request.modelId)),
    {
      sessionId: task.routingId,
      ...(thinking !== undefined ? { reasoning: thinking === "off" ? undefined : thinking } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxOutputTokens !== undefined ? { maxTokens: request.maxOutputTokens } : {}),
      ...(signal ? { signal } : {}),
    }
  );
  const events = registry.needsThinkStrip(request.providerId, request.modelId)
    ? rewriteThinkTagStream(stream)
    : stream;
  const result = await collectModelStream(events, signal, event => {
    usage.observe(event);
    onEvent?.(event);
  });
  usage.finish({ aborted: result.outcome === "aborted", error: result.error });
  return {
    ok: result.outcome === "completed",
    aborted: result.outcome === "aborted",
    message: result.message,
    ...(result.error ? { error: result.error } : {}),
  };
}
