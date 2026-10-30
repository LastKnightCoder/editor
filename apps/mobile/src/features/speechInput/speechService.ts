import { useMemo, useSyncExternalStore } from "react";
import type { SpeechInputService } from "@tau/asr";
import { defaultSpeechInputSetting } from "@tau/asr";
import { createMobileSpeechInputService } from "../../services/speechInput";
import { useMobilePlugins } from "../../app/plugins/context";
import {
  getMobileSettingSnapshot,
  subscribeMobileSettingSnapshot,
} from "../../services/mobileSettingsBridge";

const services = new WeakMap<object, SpeechInputService>();

/** 当前插件运行时对应的识别服务，同一运行时复用一个实例 */
export function useSpeechInputService(): SpeechInputService | null {
  const runtime = useMobilePlugins();
  if (!runtime) return null;
  let service = services.get(runtime.asr);
  if (!service) {
    service = createMobileSpeechInputService(runtime.asr);
    services.set(runtime.asr, service);
  }
  return service;
}

/** 不能开始录音的原因，可用时为 null */
export function useSpeechUnavailableReason(): string | null {
  const setting = useSyncExternalStore(
    subscribeMobileSettingSnapshot,
    getMobileSettingSnapshot,
    getMobileSettingSnapshot
  );
  return useMemo(() => {
    const speech = setting?.speechInput ?? defaultSpeechInputSetting();
    if (speech.active === "native") return null;
    if (!speech.plugin.configurations[speech.plugin.id]) return "识别插件账号尚未配置";
    return null;
  }, [setting]);
}

/** 错误是否该引导去「我的 › 语音 › 语音输入」 */
export function needsSpeechSettings(message: string): boolean {
  return /尚未配置/.test(message);
}
