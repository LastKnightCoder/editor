import { voiceCaptureTranslator } from "./capture-i18n";
import { useCallback, useState } from "react";
import type { Descendant } from "slate";
import * as tauri from "../../services/tauri";
import { toast } from "../../components/toast";
import { speechInputNeedsSettings } from "../../services/speechInputState";
import { speechFailureText } from "./workspace.binding";
import { useDictationSession } from "./useDictationSession";
import { useSpeechInputService, useSpeechUnavailableReason } from "./speechService";

/** 识别原文按换行拆段，作为速记卡片正文 */
export function transcriptToContent(text: string): Descendant[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(
      line => ({ type: "paragraph", children: [{ type: "formatted", text: line }] }) as Descendant
    );
}

export type VoiceCaptureOptions = {
  /** 存好后打开该卡片（toast「打开」） */
  onOpen(cardId: number): void;
  /** 卡片列表需要刷新 */
  onSaved(): void;
  /** 未配置识别服务时去设置 */
  onOpenSettings(): void;
};

/** 不经编辑器的语音速记：说完存成一张速记卡片，toast 给「打开 / 撤销」 */
export function useVoiceCapture(options: VoiceCaptureOptions) {
  const service = useSpeechInputService();
  const unavailableReason = useSpeechUnavailableReason();
  const [preview, setPreview] = useState("");
  const [cancelArmed, setCancelArmed] = useState(false);

  const save = useCallback(
    async (text: string) => {
      const content = transcriptToContent(text);
      if (content.length === 0) return;
      try {
        const card = await tauri.createQuickCard({ content, count: text.length });
        options.onSaved();
        toast({
          type: "success",
          text: voiceCaptureTranslator.t("saved"),
          duration: 4000,
          action: {
            label: voiceCaptureTranslator.t("open"),
            onClick: () => options.onOpen(card.id),
          },
        });
      } catch (error) {
        toast({
          type: "error",
          text: error instanceof Error ? error.message : voiceCaptureTranslator.t("saveFailed"),
        });
      }
    },
    [options]
  );

  const session = useDictationSession({
    service,
    onPreview: setPreview,
    onCommit: text => {
      setPreview("");
      void save(text);
    },
    onError: error => {
      setPreview("");
      const message = speechFailureText(error);
      toast({
        type: "error",
        text: message,
        action: speechInputNeedsSettings(error)
          ? { label: voiceCaptureTranslator.t("settings"), onClick: options.onOpenSettings }
          : undefined,
      });
    },
  });

  const begin = useCallback((): boolean => {
    if (unavailableReason) {
      toast({
        type: "info",
        text: voiceCaptureTranslator.t("unavailable"),
        action: { label: voiceCaptureTranslator.t("settings"), onClick: options.onOpenSettings },
      });
      return false;
    }
    setPreview("");
    session.start();
    return true;
  }, [options.onOpenSettings, session, unavailableReason]);

  const cancel = useCallback(() => {
    session.cancel();
    setPreview("");
    setCancelArmed(false);
  }, [session]);

  const finish = useCallback(() => {
    setCancelArmed(false);
    session.finish();
  }, [session]);

  return {
    phase: session.phase,
    startedAt: session.startedAt,
    active: session.phase === "connecting" || session.phase === "listening",
    preview,
    cancelArmed,
    setCancelArmed,
    begin,
    finish,
    cancel,
  };
}
