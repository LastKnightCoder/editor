import { waitForASR } from "./errors";
import type { ASRTranscript } from "./types";

export interface SpeechRefinementPreferences {
  style: "light" | "paragraphs";
  instructions: string;
}
export const DEFAULT_SPEECH_REFINEMENT: SpeechRefinementPreferences = {
  style: "light",
  instructions: "",
};
export function validateSpeechRefinementPreferences(value: unknown): SpeechRefinementPreferences {
  if (!value || typeof value !== "object") throw new Error("语音整理设置无效");
  const settings = value as Record<string, unknown>;
  if (
    (settings.style !== "light" && settings.style !== "paragraphs") ||
    typeof settings.instructions !== "string" ||
    settings.instructions.length > 1000
  )
    throw new Error("语音整理风格无效，补充要求最多 1000 字");
  return { style: settings.style, instructions: settings.instructions.trim() };
}
export type SpeechRefiner = (
  text: string,
  options: {
    signal: AbortSignal;
    onPreview(text: string): void;
  }
) => Promise<string>;
export interface SpeechRefinementResult {
  original: ASRTranscript;
  text: string;
  status: "original" | "refined" | "fallback";
}
/** 整理与原始时间轴分开；取消整个会话不交付原文，其他失败才降级。 */
export async function refineSpeechInput(
  transcript: ASRTranscript,
  refine: SpeechRefiner | undefined,
  options: { signal: AbortSignal; onPreview(text: string): void },
  timeoutMs = 30_000
): Promise<SpeechRefinementResult> {
  options.signal.throwIfAborted();
  const original = structuredClone(transcript);
  if (!refine || !original.text.trim())
    return { original, text: original.text, status: "original" };
  const lifetime = new AbortController();
  const signal = AbortSignal.any([options.signal, lifetime.signal]);
  const timer = setTimeout(
    () => lifetime.abort(new DOMException("整理超时", "TimeoutError")),
    timeoutMs
  );
  let accepting = true;
  try {
    const text = await waitForASR(
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return refine(original.text, {
          signal,
          onPreview: text => {
            if (accepting && !signal.aborted) options.onPreview(text);
          },
        });
      }),
      signal
    );
    signal.throwIfAborted();
    if (typeof text !== "string" || !text.trim()) throw new Error("整理未返回正文");
    return { original, text: text.trim(), status: "refined" };
  } catch {
    options.signal.throwIfAborted();
    return { original, text: original.text, status: "fallback" };
  } finally {
    accepting = false;
    clearTimeout(timer);
    lifetime.abort();
  }
}
