import { ipcMain } from "electron";
import { PluginAIService } from "../services/plugin-ai";
import piAi from "./pi-ai-runtime";
import usage from "./model-usage";
import settings from "./user-setting";
import { resolveV2Providers } from "./pi-ai-runtime-core";
import type { PluginAIOutcome } from "@/types/plugin-ai";

const service = new PluginAIService({
  read: key => usage.requireStore().getMeta(key),
  write: (key, value) => usage.requireStore().setMeta(key, value),
  capacity: (provider, model) => piAi.capacity(provider, model),
  audit: input => usage.beginPluginAudit(input),
  execute: async (request, signal, delta, record) => {
    const outcome = await piAi.execute(
      request,
      signal,
      event => {
        if (event.type === "text_delta") delta(event.delta);
      },
      record
    );
    return {
      ...outcome,
      text:
        outcome.message?.content
          .filter(block => block.type === "text")
          .map(block => block.text)
          .join("\n\n") ?? "",
    };
  },
});

export default {
  name: "plugin-ai",
  init() {
    const watched = new Set<number>();
    ipcMain.handle("plugin-ai:register", (event, { id, name, features }) => {
      if (!watched.has(event.sender.id)) {
        const owner = event.sender.id;
        watched.add(owner);
        event.sender.on("render-process-gone", () => service.releaseOwner(owner));
        event.sender.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
          if (isMainFrame && !_inPlace) service.releaseOwner(owner);
        });
        event.sender.once("destroyed", () => {
          watched.delete(owner);
          service.releaseOwner(owner);
        });
      }
      return service.register(event.sender.id, id, name, features);
    });
    ipcMain.handle("plugin-ai:unregister", (event, session) =>
      service.unregister(event.sender.id, session)
    );
    ipcMain.handle("plugin-ai:status", (event, { session, feature }) =>
      service.status(event.sender.id, session, feature)
    );
    ipcMain.handle(
      "plugin-ai:run",
      async (event, { session, requestId, input }): Promise<PluginAIOutcome> => {
        try {
          const result = await service.run(event.sender.id, session, requestId, input, delta => {
            if (!event.sender.isDestroyed())
              event.sender.send("plugin-ai:delta", { requestId, delta });
          });
          return { ok: true, result };
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          return {
            ok: false,
            error: message.startsWith("AI_") ? message : "AI_REQUEST_FAILED：请求失败或审计不可用",
          };
        }
      }
    );
    ipcMain.handle("plugin-ai:cancel-own", (event, { session, requestId }) =>
      service.cancelOwn(event.sender.id, session, requestId)
    );
    ipcMain.handle("plugin-ai:info", (_event, id) => service.info(id));
    ipcMain.handle("plugin-ai:configure", (_event, { id, config }) =>
      service.configure(id, config)
    );
    ipcMain.handle("plugin-ai:revoke", (_event, id) => service.revoke(id));
    ipcMain.handle("plugin-ai:running", () => service.running());
    ipcMain.handle("plugin-ai:cancel", (_event, requestId) => service.cancel(requestId));
    ipcMain.handle("plugin-ai:models", async () =>
      resolveV2Providers(await settings.getSettingSnapshot()).flatMap(provider =>
        provider.models.map(model => ({
          providerId: provider.id,
          modelId: model.id,
          label: `${provider.name} / ${model.name ?? model.id}`,
        }))
      )
    );
  },
};
