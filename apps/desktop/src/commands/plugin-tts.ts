import { withModule } from "./module-init";
import type { JsonValue } from "@tau/plugins";
export const savePluginTTSConfig = (
  instanceId: string,
  pluginId: string,
  config: JsonValue,
  models: readonly { id: string; label?: string }[]
): Promise<void> =>
  withModule("plugin-local", () =>
    window.electron.invoke("plugin-local:tts-config", instanceId, pluginId, config, models)
  );
import type { TTSRendererRequest, TTSRendererReply } from "../../shared/tts-renderer";

export function callPluginTTS<T>(request: TTSRendererRequest, signal?: AbortSignal): Promise<T> {
  return withModule("plugin-local", async () => {
    signal?.throwIfAborted();
    const requestId = crypto.randomUUID();
    const cancel = () => {
      void window.electron.invoke("plugin-local:tts-cancel", requestId).catch(() => undefined);
    };
    const pending = window.electron.invoke<TTSRendererReply>(
      "plugin-local:tts-request",
      requestId,
      request
    );
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const reply = await pending;
      signal?.throwIfAborted();
      if (reply.error !== undefined) {
        const error = new Error(reply.error);
        error.name = reply.errorName ?? "Error";
        throw error;
      }
      return reply.result as T;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  });
}
