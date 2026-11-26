import { useMemo, useSyncExternalStore } from "react";
import type { SpeechInputService } from "@tau/asr";
import { useMobilePlugins } from "../../app/plugins/context";
import { speechServiceFor } from "../../app/plugins/speech";
import { speechInputUnavailability } from "../../services/speechInputState";
import { speechFailureText } from "./workspace.binding";
import { useSpeechWorkspaceI18n } from "./workspace.i18n";
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
  useSpeechWorkspaceI18n();
  const setting = useSyncExternalStore(
    subscribeMobileSettingSnapshot,
    getMobileSettingSnapshot,
    getMobileSettingSnapshot
  );
  const failure = useMemo(() => speechInputUnavailability(setting?.speechInput), [setting]);
  return failure ? speechFailureText(failure) : null;
}
