import {
  DEFAULT_SPEECH_REFINEMENT,
  buildSpeechRefinementPrompt,
  validateSpeechRefinementPreferences,
  waitForASR,
  type SpeechRefiner,
} from "@tau/asr";
import type { SettingCompat } from "../types";
import { findAssignedModel } from "./ai-settings";

const loadMobileAi = () => import("./ai").then(module => module.getMobileAiService());

/** 录音开始时固定库、模型与风格；未分配「语音输入整理」时返回 undefined，听写不进入整理 */
export function prepareSpeechRefinement(
  setting: SettingCompat | null | undefined
): SpeechRefiner | undefined {
  const assigned = findAssignedModel(setting, "speechInputRefinement");
  const databaseName = setting?.database?.active;
  if (!assigned || !databaseName) return undefined;
  const model = { providerId: assigned.provider.id, modelId: assigned.model.id };
  const preferences = structuredClone(
    setting?.speechInput?.refinement ?? DEFAULT_SPEECH_REFINEMENT
  );
  return async (text, { signal, onPreview }) => {
    signal.throwIfAborted();
    const prompt = buildSpeechRefinementPrompt(validateSpeechRefinementPreferences(preferences));
    const service = await waitForASR(loadMobileAi(), signal);
    const handle = await waitForASR(
      service.generation.start(
        {
          requestId: crypto.randomUUID(),
          databaseName,
          model,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user(text) }],
        },
        response => {
          if (!signal.aborted) onPreview(response.content);
        }
      ),
      signal
    );
    const abort = () => handle.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    try {
      const result = await waitForASR(handle.result, signal);
      signal.throwIfAborted();
      const refined = result.response?.content ?? "";
      if (result.outcome !== "completed" || !refined.trim())
        throw new Error(result.error?.message ?? "语音整理未完整返回正文");
      return refined;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };
}
