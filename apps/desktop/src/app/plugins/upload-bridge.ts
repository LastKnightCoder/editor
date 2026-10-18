import { on, off, isElectron } from "@/electron";
import { withModule } from "@/commands/module-init";
import type { UploadRendererMessage, UploadRendererReply } from "../../../shared/upload-renderer";
import { rendererUploadRegistry } from "./upload-registry";

export function connectUploadRenderer() {
  if (!isElectron) return () => {};
  const session = crypto.randomUUID();
  let disposed = false;
  const receive = async (_event: unknown, message: UploadRendererMessage) => {
    if (disposed || message.session !== session) return;
    let reply: UploadRendererReply;
    try {
      reply = {
        session,
        requestId: message.requestId,
        url: await rendererUploadRegistry.upload(message.pluginId, message.file, message.config),
      };
    } catch (error) {
      reply = {
        session,
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (!disposed)
      await window.electron.invoke("plugin-local:upload-reply", reply).catch(() => undefined);
  };
  on("plugin-upload:request", receive);
  const ready = withModule("plugin-local", async () => {
    if (!disposed) await window.electron.invoke("plugin-local:upload-connect", session);
  }).catch(error => console.error("上传宿主连接失败", error));
  return () => {
    disposed = true;
    off("plugin-upload:request", receive);
    void ready
      .then(() => window.electron.invoke("plugin-local:upload-release", session))
      .catch(() => undefined);
  };
}
