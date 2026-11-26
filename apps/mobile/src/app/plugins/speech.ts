import type { SpeechAdapter } from "@tau/plugins/host";
import type { SpeechInputService } from "@tau/asr";
import type { ASRProviderRegistry } from "@tau/plugins/asr-host";
import { createMobileSpeechInputService } from "../../services/speechInput";
import { getMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import { SpeechInputFailure, speechInputUnavailability } from "../../services/speechInputState";

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
    unavailableReason: () =>
      speechInputUnavailability(getMobileSettingSnapshot()?.speechInput)?.message ?? null,
    async start(_context, options) {
      const failure = speechInputUnavailability(getMobileSettingSnapshot()?.speechInput);
      if (failure)
        throw new SpeechInputFailure(failure.code, `SPEECH_UNAVAILABLE：${failure.message}`);
      const session = await speechServiceFor(registry).start(options);
      return {
        result: session.result.then(transcript => transcript.text.trim()),
        stop: () => session.stop(),
        cancel: () => session.cancel(),
      };
    },
  };
}
