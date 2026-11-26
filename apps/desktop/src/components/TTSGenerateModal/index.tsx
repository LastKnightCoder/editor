import { useTtsWorkspaceI18n } from "@/services/tts-workspace.i18n";
import { ttsWorkspaceFailureText } from "@/services/tts-workspace.binding";
import { TtsWorkspaceFailure } from "@/services/tts-workspace-error";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { Mic, Play, Pause, RefreshCw } from "lucide-react";
import { Button, Dialog, DialogBody, IconButton, Select, Textarea } from "@tau/ui";
import { ResourceSelectError, ResourceSelectField } from "@/components/ResourceSelectDialog";
import { TTSProviderFactory } from "@/utils/tts/TTSProviderFactory";

interface VoiceOption {
  id: string;
  name: string;
  description?: string;
}

interface TTSGenerateModalProps {
  open: boolean;
  onCancel: () => void;
  /** 返回 Promise 时（如上传后插入），期间确认按钮 loading、弹窗不可关闭 */
  onConfirm: (audioBlob: Blob, text: string) => void | Promise<void>;
}

const TTSGenerateModal: React.FC<TTSGenerateModalProps> = ({ open, onCancel, onConfirm }) => {
  const { t, locale } = useTtsWorkspaceI18n();
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const errorText = error ? ttsWorkspaceFailureText(error) : null;
  const [confirming, setConfirming] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  const isTTSConfigured = TTSProviderFactory.getSpeechSynthesizer() !== null;

  const loadVoices = useCallback(async () => {
    if (!isTTSConfigured) return;
    setVoicesLoading(true);
    try {
      const synthesizer = TTSProviderFactory.getSpeechSynthesizer();
      if (!synthesizer) return;
      const voiceList = await synthesizer.getVoiceList();
      if (voiceList && voiceList.length > 0) {
        setVoices(
          voiceList.map(v => ({
            id: v.id,
            name: v.name,
            description: v.description,
          }))
        );
        // 函数式更新避免把 selectedVoiceId 收进 useCallback 依赖——
        // 否则切换音色会重建 loadVoices，连带触发下方初始化 effect 重跑清空已输入的文本
        setSelectedVoiceId(prev => prev || voiceList[0].id);
      }
    } catch (err) {
      console.error("Failed to load voices:", err);
    } finally {
      setVoicesLoading(false);
    }
  }, [isTTSConfigured]);

  // 重置输入与产物：仅在弹窗重新打开时执行，不得随音色/音色列表变化重跑
  useEffect(() => {
    if (!open) return;
    setText("");
    setAudioBlob(null);
    setAudioUrl(null);
    setError(null);
    setIsPlaying(false);
  }, [open]);

  useEffect(() => {
    if (open && isTTSConfigured && voices.length === 0) {
      loadVoices();
    }
  }, [open, isTTSConfigured, voices.length, loadVoices]);

  // 音频 URL 变化/卸载时释放旧资源
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const handleGenerate = useMemoizedFn(async () => {
    if (!text.trim()) {
      setError(new TtsWorkspaceFailure("text"));
      return;
    }
    if (!selectedVoiceId) {
      setError(new TtsWorkspaceFailure("voice"));
      return;
    }

    setGenerating(true);
    setError(null);
    const synthesizer = TTSProviderFactory.getSpeechSynthesizer();

    try {
      if (!synthesizer) {
        setError(new TtsWorkspaceFailure("service"));
        return;
      }
      const audioBuffer = await synthesizer.synthesizeSpeech(text.trim(), selectedVoiceId);
      if (!audioBuffer) {
        setError(new TtsWorkspaceFailure("generate"));
        return;
      }
      const blob = new Blob([audioBuffer.audio.slice().buffer as ArrayBuffer], {
        type: audioBuffer.mime,
      });
      setAudioBlob(blob);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err) {
      console.error("TTS error:", err);
      setError(new TtsWorkspaceFailure("settings", { cause: err }));
    } finally {
      await synthesizer?.dispose?.();
      setGenerating(false);
    }
  });

  const handlePlayPause = useMemoizedFn(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  });

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleConfirm = useMemoizedFn(async () => {
    if (!audioBlob || !text.trim()) return;
    setConfirming(true);
    try {
      await onConfirm(audioBlob, text.trim());
    } catch (err) {
      console.error("TTS confirm error:", err);
      setError(err instanceof Error ? err : new TtsWorkspaceFailure("add", { cause: err }));
    } finally {
      setConfirming(false);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title={t("title")}
      subtitle={t("hint")}
      icon={<Mic className="size-4" strokeWidth={1.75} />}
      width={500}
      locked={generating || confirming}
      footer={
        isTTSConfigured ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="mr-auto"
              loading={generating}
              loadingText={t("action.generating")}
              disabled={!text.trim() || !selectedVoiceId}
              onClick={handleGenerate}
            >
              {audioBlob ? (
                <>
                  <RefreshCw className="size-3.5" strokeWidth={1.75} />
                  {t("action.regenerate")}
                </>
              ) : (
                t("action.generate")
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={generating || confirming}
              onClick={onCancel}
            >
              {t("action.cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={confirming}
              loadingText={t("action.adding")}
              disabled={!audioBlob || generating}
              onClick={() => void handleConfirm()}
            >
              {t("action.add")}
            </Button>
          </>
        ) : (
          <Button variant="primary" size="sm" data-autofocus onClick={onCancel}>
            {t("action.acknowledge")}
          </Button>
        )
      }
    >
      <DialogBody>
        {!isTTSConfigured ? (
          <div className="bg-warn-soft rounded-tau-sm px-3.5 py-2.5">
            <div className="text-tau-meta text-warn font-medium">{t("config.missing")}</div>
            <div className="text-tau-sm text-ink-2 mt-0.5">{t("config.hint")}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <ResourceSelectField label={t("voice.title")}>
              <Select
                aria-label={t("voice.title")}
                value={selectedVoiceId || null}
                onValueChange={v => setSelectedVoiceId(v)}
                placeholder={voicesLoading ? t("voice.loading") : t("voice.choose")}
                disabled={voicesLoading}
                searchable={voices.length > 8}
                options={voices.map(v => ({
                  value: v.id,
                  label: v.name,
                  searchText: v.description,
                }))}
              />
            </ResourceSelectField>
            <ResourceSelectField label={t("text.title")}>
              <Textarea
                data-autofocus
                value={text}
                onChange={e => {
                  setText(e.target.value);
                  setError(null);
                }}
                placeholder={t("text.placeholder")}
                rows={5}
                className="resize-none"
              />
            </ResourceSelectField>
            {errorText && <ResourceSelectError text={errorText} />}
            {audioUrl && (
              <div className="border-line-1 rounded-tau-md flex items-center gap-3 border px-3 py-2.5">
                <audio ref={audioRef} src={audioUrl} onEnded={handleAudioEnded} />
                <IconButton
                  aria-label={isPlaying ? t("preview.pause") : t("preview.play")}
                  onClick={handlePlayPause}
                >
                  {isPlaying ? (
                    <Pause className="size-4" strokeWidth={1.75} />
                  ) : (
                    <Play className="size-4" strokeWidth={1.75} />
                  )}
                </IconButton>
                <div className="min-w-0 flex-1">
                  <div className="text-tau-body text-ink-1 font-medium">{t("preview.ready")}</div>
                  <div className="text-tau-sm text-ink-3">
                    {t("preview.hint", {
                      count: text.trim().length,
                      number: text.trim().length.toLocaleString(locale),
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
};

export default TTSGenerateModal;
