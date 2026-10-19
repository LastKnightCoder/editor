import { withModule } from "./module-init";
import type { JsonValue } from "@tau/plugins";
export const savePluginImagesConfig = (
  instanceId: string,
  pluginId: string,
  config: JsonValue,
  modelId: string
): Promise<void> =>
  withModule("plugin-local", () =>
    window.electron.invoke("plugin-local:images-config", instanceId, pluginId, config, modelId)
  );
import type { ImagesRendererRequest, ImagesRendererReply } from "../../shared/images-renderer";

export function callPluginImages<T>(
  request: ImagesRendererRequest,
  signal?: AbortSignal
): Promise<T> {
  return withModule("plugin-local", async () => {
    signal?.throwIfAborted();
    const requestId = crypto.randomUUID();
    const cancel = () => {
      void window.electron.invoke("plugin-local:images-cancel", requestId).catch(() => undefined);
    };
    const pending = window.electron.invoke<ImagesRendererReply>(
      "plugin-local:images-request",
      requestId,
      request
    );
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
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
