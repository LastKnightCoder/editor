import {
  createSpeechInputService,
  defaultSpeechInputSetting,
  MAC_NATIVE_ASR_DEFAULTS,
} from "@tau/asr";
import type { SpeechInputService } from "@tau/asr";
import type { ASRProviderRegistry } from "@tau/plugins/asr-host";
import { copyJson } from "@tau/plugins/host";
import { getMobileSettingSnapshot } from "./mobileSettingsBridge";
import { SpeechInputFailure } from "./speechInputState";
import { startNativeSpeechInput } from "./nativeSpeechInput";

export function createMobileSpeechInputService(registry: ASRProviderRegistry) {
  const pluginService = createSpeechInputService(async (taskId, signal, onEvent) => {
    const setting = structuredClone(
      getMobileSettingSnapshot()?.speechInput ?? defaultSpeechInputSetting()
    );
    if (setting.active !== "plugin") throw new SpeechInputFailure("SPEECH_PLUGIN_NOT_CONFIGURED");
    const account = setting.plugin.configurations[setting.plugin.id];
    if (!account) throw new SpeechInputFailure("SPEECH_ACCOUNT_NOT_CONFIGURED");
    const { instance } = registry.create(
      setting.plugin.id,
      copyJson(account.config),
      account.modelId
    );
    const availability = await instance.probe(
      { input: "stream", language: setting.language },
      signal
    );
    if (availability.state !== "ready") {
      if (availability.reason !== undefined && availability.reason !== null)
        throw new Error(availability.reason);
      throw new SpeechInputFailure("SPEECH_PLUGIN_NOT_READY");
    }
    const format = availability.acceptedAudio?.streamFormats?.[0] ?? MAC_NATIVE_ASR_DEFAULTS.format;
    const session = await registry.openStream(
      setting.plugin.id,
      copyJson(account.config),
      account.modelId,
      { format, language: setting.language },
      { taskId, signal, onEvent }
    );
    return { session, format, release: async () => undefined };
  });
  let active = false;
  return {
    async start(options) {
      if (active) throw new SpeechInputFailure("SPEECH_INPUT_BUSY");
      active = true;
      try {
        const setting = getMobileSettingSnapshot()?.speechInput ?? defaultSpeechInputSetting();
        const session = await (setting.active === "native"
          ? startNativeSpeechInput(setting.language, options)
          : pluginService.start(options));
        const result = session.result.finally(() => {
          active = false;
        });
        void result.catch(() => undefined);
        return { ...session, result };
      } catch (error) {
        active = false;
        throw error;
      }
    },
  } satisfies SpeechInputService;
}
