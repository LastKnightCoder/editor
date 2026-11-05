import { ipcMain } from "electron";
import { INLINE_SUGGESTION_SLOT } from "@/types/inline-suggestions";
import { resolveUsageSlot, type SettingForLlmSlots } from "./llm-usage-slot";
import {
  createInlineSuggestionService,
  parseInlineSuggestionRequest,
} from "./inline-suggestions-service";
import PiAiRuntimeModule from "./pi-ai-runtime";
import userSettingModule from "./user-setting";

export default {
  async init() {
    const service = createInlineSuggestionService((request, signal) =>
      PiAiRuntimeModule.complete(request, signal)
    );
    const configure = (setting: SettingForLlmSlots & { inlineSuggestionShared?: boolean }) =>
      service.configure(
        resolveUsageSlot(setting, INLINE_SUGGESTION_SLOT),
        setting.inlineSuggestionShared === true
      );
    let changed = false;
    const stopSettings = userSettingModule.onSettingChanged(({ newSetting }) => {
      changed = true;
      configure(newSetting);
    });
    try {
      const setting = await userSettingModule.getSettingSnapshot();
      if (!changed) configure(setting);
    } catch (error) {
      stopSettings();
      throw error;
    }
    const observed = new WeakSet<Electron.WebContents>();

    ipcMain.handle("inline-suggestions:request", async ({ sender }, raw: unknown) => {
      const request = parseInlineSuggestionRequest(raw);
      if (!request || sender.isDestroyed()) return null;
      const id = sender.id;
      if (!observed.has(sender)) {
        observed.add(sender);
        const disconnect = () => service.disconnect(id);
        sender.once("destroyed", disconnect);
        sender.on("render-process-gone", disconnect);
      }
      return service.suggest(id, request);
    });
    ipcMain.handle(
      "inline-suggestions:cancel",
      ({ sender }, id: unknown) => typeof id === "string" && service.cancel(sender.id, id)
    );
  },
};
