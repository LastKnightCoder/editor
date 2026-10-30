import {
  buildSpeechRefinementPrompt,
  DEFAULT_SPEECH_REFINEMENT,
  validateSpeechRefinementPreferences,
  waitForASR,
  type SpeechRefiner,
} from "@tau/asr";
import { Role } from "@/constants";
import useSettingStore from "@/stores/useSettingStore";
import { withModule } from "@/commands/module-init";
import { piStreamText } from "./piLLM";

/** 录音开始时固定用途、模型和风格；不在整理时静默切换其他配置。 */
export function prepareSpeechRefinement(): SpeechRefiner | undefined {
  const setting = useSettingStore.getState().setting;
  const selection = setting.llmUsageSettings.speechInputRefinement;
  if (!selection) return undefined;
  const provider = setting.llmProviders.find(item => item.id === selection.providerId);
  const model = provider?.models.find(item => item.id === selection.modelId);
  const preferences = structuredClone(setting.speechInput?.refinement ?? DEFAULT_SPEECH_REFINEMENT);
  const selected = provider && model ? structuredClone({ provider, model }) : undefined;
  return async (text, { signal, onPreview }) => {
    signal.throwIfAborted();
    if (!selected) throw new Error("语音整理模型已不可用");
    const policy = validateSpeechRefinementPreferences(preferences);
    await waitForASR(
      withModule("pi-ai", async () => undefined),
      signal
    );
    signal.throwIfAborted();
    const prompt = buildSpeechRefinementPrompt(policy);
    const handle = piStreamText(
      {
        ...selected,
        thinking: selected.model.thinkingLevel,
        messages: [
          { role: Role.System, content: prompt.system },
          { role: Role.User, content: prompt.user(text) },
        ],
        source: { feature: "speechInputRefinement" },
      },
      snapshot => {
        if (!signal.aborted) onPreview(snapshot.text);
      }
    );
    const abort = () => handle.cancel();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    try {
      const result = await waitForASR(handle.result, signal);
      signal.throwIfAborted();
      if (
        !result.ok ||
        result.aborted ||
        result.message?.stopReason !== "stop" ||
        !result.text.trim()
      )
        throw new Error("语音整理未完整返回正文");
      return result.text;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };
}
