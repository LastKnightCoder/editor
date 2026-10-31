import { useMemo, useSyncExternalStore } from "react";
import type { SpeechInputService } from "@tau/asr";
import { useMobilePlugins } from "../../app/plugins/context";
import { speechServiceFor, speechUnavailableReason } from "../../app/plugins/speech";
import {
  getMobileSettingSnapshot,
  subscribeMobileSettingSnapshot,
} from "../../services/mobileSettingsBridge";

/** 当前插件运行时对应的识别服务，同一运行时复用一个实例 */
export function useSpeechInputService(): SpeechInputService | null {
  const runtime = useMobilePlugins();
  return runtime ? speechServiceFor(runtime.asr) : null;
}

/** 不能开始录音的原因，可用时为 null */
export function useSpeechUnavailableReason(): string | null {
  const setting = useSyncExternalStore(
    subscribeMobileSettingSnapshot,
    getMobileSettingSnapshot,
    getMobileSettingSnapshot
  );
  return useMemo(() => speechUnavailableReason(setting), [setting]);
}

/** 错误是否该引导去「我的 › 语音 › 语音输入」 */
export function needsSpeechSettings(message: string): boolean {
  return /尚未配置/.test(message);
}
