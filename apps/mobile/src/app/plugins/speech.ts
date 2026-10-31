import type { SpeechAdapter } from "@tau/plugins/host";
import { defaultSpeechInputSetting, type SpeechInputService } from "@tau/asr";
import type { ASRProviderRegistry } from "@tau/plugins/asr-host";
import { createMobileSpeechInputService } from "../../services/speechInput";
import { getMobileSettingSnapshot } from "../../services/mobileSettingsBridge";

/** 与应用自己的语音输入共用识别设置；可用时为 null */
export function speechUnavailableReason(
  setting: ReturnType<typeof getMobileSettingSnapshot> = getMobileSettingSnapshot()
): string | null {
  const speech = setting?.speechInput ?? defaultSpeechInputSetting();
  if (speech.active === "native") return null;
  if (!speech.plugin.configurations[speech.plugin.id]) return "识别插件账号尚未配置";
  return null;
}

const services = new WeakMap<ASRProviderRegistry, SpeechInputService>();

/** 同一插件运行时只有一个识别服务：应用听写与插件录音互斥，不会同时占用麦克风 */
export function speechServiceFor(registry: ASRProviderRegistry): SpeechInputService {
  let service = services.get(registry);
  if (!service) {
    service = createMobileSpeechInputService(registry);
    services.set(registry, service);
  }
  return service;
}

/** 插件拿到的只有识别文字，不接触音频 */
export function createMobilePluginSpeech(registry: ASRProviderRegistry): SpeechAdapter {
  return {
    unavailableReason: () => speechUnavailableReason(),
    async start(_context, options) {
      const reason = speechUnavailableReason();
      if (reason) throw new Error(`SPEECH_UNAVAILABLE：${reason}`);
      const session = await speechServiceFor(registry).start(options);
      return {
        result: session.result.then(transcript => transcript.text.trim()),
        stop: () => session.stop(),
        cancel: () => session.cancel(),
      };
    },
  };
}
