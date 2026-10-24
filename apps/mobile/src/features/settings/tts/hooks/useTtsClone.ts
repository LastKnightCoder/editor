import { useCallback, useEffect, useRef, useState } from "react";
import type { TTSVoice } from "@tau/plugins";
import type { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import { usePageInstanceContext, usePageLifecycle } from "../../../../router";
import { withMobilePluginTTS } from "../../../../services/plugin-tts";
import type { TTSProviderSetting } from "../../../../types";
import { isTtsAbort, ttsErrorMessage } from "../errors";

const MIME_ALIASES: Record<string, string> = {
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/mp3": "audio/mpeg",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
};

function fileMimeType(file: File): string {
  const type = file.type.trim().toLowerCase();
  if (type) return MIME_ALIASES[type] ?? type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "m4a") return "audio/mp4";
  return "application/octet-stream";
}

export function useTtsClone({
  runtime,
  account,
  modelId,
  enabled,
}: {
  runtime: MobilePluginRuntime | null;
  account: TTSProviderSetting | undefined;
  modelId: string;
  enabled: boolean;
}) {
  const { phase } = usePageInstanceContext();
  const activeRef = useRef(phase === "active");
  activeRef.current = phase === "active";
  const mountedRef = useRef(true);
  const runRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TTSVoice | null>(null);
  const [error, setError] = useState("");

  const abortPending = useCallback(() => {
    runRef.current += 1;
    controllerRef.current?.abort(new DOMException("音色复刻已取消", "AbortError"));
    controllerRef.current = null;
  }, []);
  const stop = useCallback(() => {
    abortPending();
    setPending(false);
    setResult(null);
    setError("");
  }, [abortPending]);
  const cancel = useCallback(() => {
    abortPending();
    setPending(false);
    setError("");
  }, [abortPending]);

  usePageLifecycle({ onPause: stop, onDestroy: stop });
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRef.current = false;
      runRef.current += 1;
      controllerRef.current?.abort(new DOMException("音色复刻已结束", "AbortError"));
      controllerRef.current = null;
    };
  }, []);
  const contextKey = `${account?.id ?? ""}:${modelId}:${enabled}`;
  const previousContextRef = useRef(contextKey);
  useEffect(() => {
    if (previousContextRef.current === contextKey) return;
    previousContextRef.current = contextKey;
    stop();
  }, [contextKey, stop]);

  const clone = useCallback(
    async (file: File, name: string) => {
      const cleanName = name.trim();
      if (!runtime || !account || !enabled || !modelId) {
        setError("当前模型不支持音色复刻，或语音插件不可用");
        return;
      }
      if (!cleanName) {
        setError("请输入音色名称");
        return;
      }
      abortPending();
      setPending(true);
      setResult(null);
      setError("");
      const controller = new AbortController();
      controllerRef.current = controller;
      const ticket = runRef.current;
      const isCurrent = () =>
        mountedRef.current &&
        activeRef.current &&
        runRef.current === ticket &&
        !controller.signal.aborted;
      try {
        const content = new Uint8Array(await file.arrayBuffer());
        if (!isCurrent()) return;
        const voice = await withMobilePluginTTS(
          runtime,
          { pluginId: account.pluginId, config: account.config, modelId },
          session => {
            if (!session.info.canClone) throw new Error("当前模型不支持音色复刻");
            return session.clone(
              {
                file: { name: file.name, mimeType: fileMimeType(file), content },
                name: cleanName,
              },
              controller.signal
            );
          },
          controller.signal
        );
        if (!isCurrent()) return;
        setResult(voice);
      } catch (issue) {
        if (!isCurrent()) return;
        setResult(null);
        if (!isTtsAbort(issue) && !controller.signal.aborted) {
          setError(ttsErrorMessage(issue, account.config, "音色复刻失败，请检查配置后重试"));
        }
      } finally {
        if (runRef.current === ticket) {
          controllerRef.current = null;
          setPending(false);
        }
      }
    },
    [abortPending, account, enabled, modelId, runtime]
  );

  return { pending, result, error, clone, cancel, reset: stop };
}
