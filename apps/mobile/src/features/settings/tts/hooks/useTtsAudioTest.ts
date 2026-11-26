import { ttsIssue, ttsIssueText, type TtsIssue, useTtsSettingsI18n } from "../i18n";
import { TtsSettingsError } from "../tts-settings-error";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import { usePageInstanceContext, usePageLifecycle } from "../../../../router";
import { withMobilePluginTTS } from "../../../../services/plugin-tts";
import type { TTSProviderSetting } from "../../../../types";
import { isTtsAbort } from "../errors";

export type TtsAudioResult = { url: string; mime: string; size: number; blob: Blob };

export function useTtsAudioTest({
  runtime,
  account,
  modelId,
  voiceId,
  enabled,
  speed,
  maxLength = 500,
}: {
  runtime: MobilePluginRuntime | null;
  account: TTSProviderSetting | undefined;
  modelId: string;
  voiceId: string;
  enabled: boolean;
  /** 语速倍率，缺省交给服务商默认值 */
  speed?: number;
  maxLength?: number;
}) {
  useTtsSettingsI18n();
  const { phase } = usePageInstanceContext();
  const activeRef = useRef(phase === "active");
  activeRef.current = phase === "active";
  const mountedRef = useRef(true);
  const runRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audio, setAudio] = useState<TtsAudioResult | null>(null);
  const [pending, setPending] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [failure, setFailure] = useState<TtsIssue | null>(null);
  const error = ttsIssueText(failure);

  const disposeAudio = useCallback(() => {
    audioRef.current?.pause();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);
  const abortPending = useCallback(() => {
    runRef.current += 1;
    controllerRef.current?.abort(new DOMException("语音测试已取消", "AbortError"));
    controllerRef.current = null;
  }, []);
  const clearAudio = useCallback(() => {
    disposeAudio();
    setAudio(null);
    setGenerated(false);
  }, [disposeAudio]);
  const stop = useCallback(() => {
    abortPending();
    disposeAudio();
    setAudio(null);
    setPending(false);
    setGenerated(false);
    setFailure(null);
  }, [abortPending, disposeAudio]);
  const cancel = useCallback(() => {
    abortPending();
    setPending(false);
    setGenerated(false);
    setFailure(null);
  }, [abortPending]);

  usePageLifecycle({ onPause: stop, onDestroy: stop });
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRef.current = false;
      runRef.current += 1;
      controllerRef.current?.abort(new DOMException("语音测试已结束", "AbortError"));
      controllerRef.current = null;
      disposeAudio();
    };
  }, [disposeAudio]);
  const contextKey = `${account?.id ?? ""}:${modelId}:${voiceId}:${speed ?? ""}:${enabled}`;
  const previousContextRef = useRef(contextKey);
  useEffect(() => {
    if (previousContextRef.current === contextKey) return;
    previousContextRef.current = contextKey;
    stop();
  }, [contextKey, stop]);

  const synthesize = useCallback(
    async (text: string) => {
      const cleanText = text.trim();
      if (!runtime || !account || !enabled || !modelId) {
        setFailure({ key: "validation.synthesisUnavailable" });
        return;
      }
      if (!cleanText) {
        setFailure({ key: "validation.textRequired" });
        return;
      }
      if (cleanText.length > maxLength) {
        setFailure({ key: "validation.textLimit", values: { limit: maxLength } });
        return;
      }
      if (!voiceId.trim()) {
        setFailure({ key: "validation.voiceRequired" });
        return;
      }

      abortPending();
      clearAudio();
      setFailure(null);
      setPending(true);
      const controller = new AbortController();
      controllerRef.current = controller;
      const ticket = runRef.current;
      const isCurrent = () =>
        mountedRef.current &&
        activeRef.current &&
        runRef.current === ticket &&
        !controller.signal.aborted;
      try {
        const result = await withMobilePluginTTS(
          runtime,
          { pluginId: account.pluginId, config: account.config, modelId },
          session =>
            session.synthesize(
              {
                text: cleanText,
                voiceId: voiceId.trim(),
                ...(speed === undefined ? {} : { options: { speed } }),
              },
              controller.signal
            ),
          controller.signal
        );
        if (!isCurrent()) return;
        if (!result.audio.byteLength) throw new TtsSettingsError("EMPTY_AUDIO");
        const bytes = new Uint8Array(result.audio);
        const blob = new Blob([bytes.buffer], { type: result.mime || "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        if (!isCurrent()) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setAudio({ url, mime: blob.type, size: blob.size, blob });
        setGenerated(true);
      } catch (issue) {
        if (!isCurrent()) return;
        disposeAudio();
        setAudio(null);
        setGenerated(false);
        if (!isTtsAbort(issue) && !controller.signal.aborted) {
          setFailure(ttsIssue(issue, account.config, "error.synthesisFailed"));
        }
      } finally {
        if (runRef.current === ticket) {
          controllerRef.current = null;
          setPending(false);
        }
      }
    },
    [
      abortPending,
      account,
      clearAudio,
      disposeAudio,
      enabled,
      maxLength,
      modelId,
      runtime,
      speed,
      voiceId,
    ]
  );

  return { audio, pending, generated, error, audioRef, synthesize, cancel, stop };
}
