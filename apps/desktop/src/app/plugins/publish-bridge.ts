import { on, off, isElectron } from "@/electron";
import type {
  PublishRendererMessage,
  PublishRendererReply,
} from "../../../shared/publish-renderer";
import { rendererPublishRegistry } from "./publish-registry";

export function connectPublishRenderer() {
  if (!isElectron) return () => {};
  const receive = async (_event: unknown, message: PublishRendererMessage) => {
    let reply: PublishRendererReply;
    try {
      reply = {
        requestId: message.requestId,
        result: await rendererPublishRegistry.execute(message),
      };
    } catch (error) {
      reply = {
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await window.electron.invoke("plugin-local:publish-reply", reply).catch(() => undefined);
  };
  on("plugin-publish:request", receive);
  return () => {
    off("plugin-publish:request", receive);
    void window.electron.invoke("plugin-local:publish-release-window").catch(() => undefined);
  };
}
