import type {
  PluginAIFeatures,
  PluginAICapability,
  PluginAICapabilityClient,
  PluginAIFeature,
  PluginAIEvent,
  PluginAIRequest,
  PluginAIResult,
} from "@tau/plugins";
import { on, off } from "@/electron";
import { invokePluginAI } from "@/commands/plugin-ai";
import { openPage } from "@/services/page-navigation";
import type { PluginAIOutcome } from "@/types/plugin-ai";
import { queryClient } from "@/queryClient";

export const desktopPluginAI = {
  async bindCapability(
    plugin: { id: string; name: string },
    capability: PluginAICapability,
    lifetime: AbortSignal
  ): Promise<PluginAICapabilityClient> {
    const client = await desktopPluginAI.bind(plugin, [], lifetime, capability);
    void queryClient.invalidateQueries({ queryKey: ["plugin-ai", plugin.id] });
    return {
      chat: request => client.chat({ ...request, feature: capability }),
      stream: request => client.stream({ ...request, feature: capability }),
    };
  },
  async bind(
    plugin: { id: string; name: string },
    features: readonly PluginAIFeature[],
    lifetime: AbortSignal,
    hostFeature?: PluginAICapability
  ): Promise<PluginAIFeatures> {
    lifetime.throwIfAborted();
    const session = await invokePluginAI<string>("register", { ...plugin, features, hostFeature });
    const dispose = () => {
      void invokePluginAI("unregister", session).catch(console.error);
    };
    if (lifetime.aborted) {
      dispose();
      lifetime.throwIfAborted();
    }
    lifetime.addEventListener("abort", dispose, { once: true });

    async function* stream(request: PluginAIRequest): AsyncGenerator<PluginAIEvent> {
      const signal = AbortSignal.any([lifetime, ...(request.signal ? [request.signal] : [])]);
      signal.throwIfAborted();
      const requestId = crypto.randomUUID();
      const queue: string[] = [];
      let wake: (() => void) | undefined;
      let outcome: PluginAIOutcome | undefined;
      let failure: unknown;
      let ended = false;
      const listener = (_event: unknown, event: { requestId: string; delta: string }) => {
        if (event.requestId === requestId) {
          queue.push(event.delta);
          wake?.();
        }
      };
      on("plugin-ai:delta", listener);
      const cancel = () => {
        void invokePluginAI("cancel-own", { session, requestId }).catch(console.error);
        wake?.();
      };
      signal.addEventListener("abort", cancel, { once: true });
      const input = {
        feature: request.feature,
        messages: request.messages,
        maxOutputTokens: request.maxOutputTokens,
      };
      const pending = invokePluginAI<PluginAIOutcome>("run", { session, requestId, input })
        .then(
          value => {
            outcome = value;
          },
          error => {
            failure = error;
          }
        )
        .finally(() => {
          ended = true;
          wake?.();
        });
      try {
        while (!ended || queue.length) {
          signal.throwIfAborted();
          const delta = queue.shift();
          if (delta !== undefined) yield { type: "text", delta };
          else if (!ended)
            await new Promise<void>(resolve => {
              wake = resolve;
            });
        }
        signal.throwIfAborted();
        if (failure) throw failure;
        if (!outcome?.ok) throw new Error(outcome?.error ?? "AI_REQUEST_FAILED");
        yield { type: "done", result: outcome.result };
      } finally {
        if (!ended) cancel();
        signal.removeEventListener("abort", cancel);
        off("plugin-ai:delta", listener);
        void pending;
      }
    }
    return {
      getStatus: feature => {
        lifetime.throwIfAborted();
        return invokePluginAI("status", { session, feature });
      },
      openSettings: () => {
        lifetime.throwIfAborted();
        openPage("plugin-detail", { pluginId: plugin.id, tab: "settings" });
      },
      stream,
      async chat(request): Promise<PluginAIResult> {
        for await (const event of stream(request)) if (event.type === "done") return event.result;
        throw new Error("AI_REQUEST_FAILED");
      },
    };
  },
};
