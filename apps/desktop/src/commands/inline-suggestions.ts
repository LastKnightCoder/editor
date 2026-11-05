import type { InlineSuggestionProvider } from "@tau/editor";
import { invoke } from "@/electron";
import type { InlineSuggestionRequest } from "@/types/inline-suggestions";
import type { LLMUsageConfigV2 } from "@/types/pi-llm";
import { withModule } from "./module-init";

export function createDesktopInlineSuggestionProvider(
  model: LLMUsageConfigV2,
  shared: boolean
): InlineSuggestionProvider {
  return {
    suggest(context, signal) {
      return withModule("inline-suggestions", async () => {
        signal.throwIfAborted();
        const request: InlineSuggestionRequest = {
          ...context,
          providerId: model.providerId,
          modelId: model.modelId,
          shared,
          requestId: crypto.randomUUID(),
        };
        const cancel = () => {
          void invoke("inline-suggestions:cancel", request.requestId).catch(() => undefined);
        };
        signal.addEventListener("abort", cancel, { once: true });
        try {
          const result = await invoke<string | null>("inline-suggestions:request", request);
          return signal.aborted ? null : result;
        } finally {
          signal.removeEventListener("abort", cancel);
        }
      });
    },
  };
}
