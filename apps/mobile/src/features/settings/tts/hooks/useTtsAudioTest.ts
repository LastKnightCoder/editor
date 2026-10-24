import { useCallback, useEffect, useRef, useState } from "react";
import type { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import { usePageInstanceContext, usePageLifecycle } from "../../../../router";
import { withMobilePluginTTS } from "../../../../services/plugin-tts";
import type { TTSProviderSetting } from "../../../../types";
import { isTtsAbort, ttsErrorMessage } from "../errors";

export type TtsAudioResult = { url: string; mime: string; size: number };

export function useTtsAudioTest({
  runtime,
  account,
  modelId,
  voiceId,
  enabled,
}: {
  runtime: MobilePluginRuntime | null;
  account: TTSProviderSetting | undefined;
  modelId: string;
  voiceId: string;
  enabled: boolean;
}) {
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
  const [error, setError] = useState("");

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
    setError("");
  }, [abortPending, disposeAudio]);
  const cancel = useCallback(() => {
    abortPending();
    setPending(false);
    setGenerated(false);
    setError("");
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
  const contextKey = `${account?.id ?? ""}:${modelId}:${voiceId}:${enabled}`;
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
        setError("语音服务不可用，请检查插件与账号配置");
        return;
      }
      if (!cleanText) {
        setError("请输入测试文本");
        return;
      }
      if (cleanText.length > 500) {
        setError("测试文本不能超过 500 字");
        return;
      }
      if (!voiceId.trim()) {
        setError("请选择或手动输入音色 ID");
        return;
      }

      abortPending();
      clearAudio();
      setError("");
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
            session.synthesize({ text: cleanText, voiceId: voiceId.trim() }, controller.signal),
          controller.signal
        );
        if (!isCurrent()) return;
        if (!result.audio.byteLength) throw new Error("服务商没有返回音频数据");
        const bytes = new Uint8Array(result.audio);
        const blob = new Blob([bytes.buffer], { type: result.mime || "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        if (!isCurrent()) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setAudio({ url, mime: blob.type, size: blob.size });
        setGenerated(true);
      } catch (issue) {
        if (!isCurrent()) return;
        disposeAudio();
        setAudio(null);
        setGenerated(false);
        if (!isTtsAbort(issue) && !controller.signal.aborted) {
          setError(ttsErrorMessage(issue, account.config, "语音合成失败，请检查账号后重试"));
        }
      } finally {
        if (runRef.current === ticket) {
          controllerRef.current = null;
          setPending(false);
        }
      }
    },
    [abortPending, account, clearAudio, disposeAudio, enabled, modelId, runtime, voiceId]
  );

  return { audio, pending, generated, error, audioRef, synthesize, cancel, stop };
}
