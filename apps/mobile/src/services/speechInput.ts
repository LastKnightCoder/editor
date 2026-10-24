import {
  createSpeechInputService,
  defaultSpeechInputSetting,
  MAC_NATIVE_ASR_DEFAULTS,
} from "@tau/asr";
import type { ASRProviderRegistry } from "@tau/plugins/asr-host";
import { copyJson } from "@tau/plugins/host";
import { getMobileSettingSnapshot } from "./mobileSettingsBridge";

export function createMobileSpeechInputService(registry: ASRProviderRegistry) {
  return createSpeechInputService(async (taskId, signal, onEvent) => {
    const setting = structuredClone(
      getMobileSettingSnapshot()?.speechInput ?? defaultSpeechInputSetting()
    );
    if (setting.active !== "plugin") throw new Error("语音输入尚未配置识别插件");
    const account = setting.plugin.configurations[setting.plugin.id];
    if (!account) throw new Error("识别插件账号尚未配置");
    const { instance } = registry.create(
      setting.plugin.id,
      copyJson(account.config),
      account.modelId
    );
    const availability = await instance.probe(
      { input: "stream", language: setting.language },
      signal
    );
    if (availability.state !== "ready") throw new Error(availability.reason ?? "识别插件尚未就绪");
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
}
