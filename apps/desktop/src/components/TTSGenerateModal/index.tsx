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
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Check if TTS is configured via TTSProviderFactory
  const isTTSConfigured = TTSProviderFactory.getTTSProvider()?.isConfigured() ?? false;

  // Load voice list
  const loadVoices = useCallback(async () => {
    if (!isTTSConfigured) return;
    setVoicesLoading(true);
    try {
      const provider = TTSProviderFactory.getTTSProvider();
      if (!provider) return;
      const voiceList = await provider.getVoiceList();
      if (voiceList && voiceList.length > 0) {
        setVoices(
          voiceList.map(v => ({
            id: v.id,
            name: v.name,
            description: v.description,
          }))
        );
        if (!selectedVoiceId) {
          setSelectedVoiceId(voiceList[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load voices:", err);
    } finally {
      setVoicesLoading(false);
    }
  }, [isTTSConfigured, selectedVoiceId]);

  useEffect(() => {
    if (open) {
      setText("");
      setAudioBlob(null);
      setAudioUrl(null);
      setError(null);
      setIsPlaying(false);
      if (isTTSConfigured && voices.length === 0) {
        loadVoices();
      }
    }
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [open, isTTSConfigured, loadVoices, voices.length]);

  const handleGenerate = useMemoizedFn(async () => {
    if (!text.trim()) {
      setError("请输入要转换的文本");
      return;
    }
    if (!selectedVoiceId) {
      setError("请选择一个音色");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const provider = TTSProviderFactory.getTTSProvider();
      if (!provider) {
        setError("TTS服务不可用");
        return;
      }
      const audioBuffer = await provider.synthesizeSpeech(text.trim(), selectedVoiceId);
      if (!audioBuffer) {
        setError("文本转语音失败，请重试");
        return;
      }
      const blob = new Blob([audioBuffer], { type: "audio/mp3" });
      setAudioBlob(blob);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err) {
      console.error("TTS error:", err);
      setError("文本转语音失败，请检查配置");
    } finally {
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
      setError(err instanceof Error ? err.message : "添加音频失败，请重试");
    } finally {
      setConfirming(false);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title="文本转语音"
      subtitle="输入文字，生成后可试听再添加"
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
              loadingText="生成中…"
              disabled={!text.trim() || !selectedVoiceId}
              onClick={handleGenerate}
            >
              {audioBlob ? (
                <>
                  <RefreshCw className="size-3.5" strokeWidth={1.75} />
                  重新生成
                </>
              ) : (
                "生成音频"
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={generating || confirming}
              onClick={onCancel}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={confirming}
              loadingText="正在添加…"
              disabled={!audioBlob || generating}
              onClick={() => void handleConfirm()}
            >
              确认添加
            </Button>
          </>
        ) : (
          <Button variant="primary" size="sm" data-autofocus onClick={onCancel}>
            知道了
          </Button>
        )
      }
    >
      <DialogBody>
        {!isTTSConfigured ? (
          <div className="bg-warn-soft rounded-tau-sm px-3.5 py-2.5">
            <div className="text-tau-meta text-warn font-medium">语音服务未配置</div>
            <div className="text-tau-sm text-ink-2 mt-0.5">
              请先在设置中配置语音合成服务后再使用此功能
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <ResourceSelectField label="音色">
              <Select
                aria-label="音色"
                value={selectedVoiceId || null}
                onValueChange={v => setSelectedVoiceId(v)}
                placeholder={voicesLoading ? "正在加载音色…" : "选择音色"}
                disabled={voicesLoading}
                searchable={voices.length > 8}
                options={voices.map(v => ({
                  value: v.id,
                  label: v.name,
                  searchText: v.description,
                }))}
              />
            </ResourceSelectField>
            <ResourceSelectField label="文本">
              <Textarea
                data-autofocus
                value={text}
                onChange={e => {
                  setText(e.target.value);
                  setError(null);
                }}
                placeholder="输入要转换成语音的文字"
                rows={5}
                className="resize-none"
              />
            </ResourceSelectField>
            {error && <ResourceSelectError text={error} />}
            {audioUrl && (
              <div className="border-line-1 rounded-tau-md flex items-center gap-3 border px-3 py-2.5">
                <audio ref={audioRef} src={audioUrl} onEnded={handleAudioEnded} />
                <IconButton aria-label={isPlaying ? "暂停" : "试听"} onClick={handlePlayPause}>
                  {isPlaying ? (
                    <Pause className="size-4" strokeWidth={1.75} />
                  ) : (
                    <Play className="size-4" strokeWidth={1.75} />
                  )}
                </IconButton>
                <div className="min-w-0 flex-1">
                  <div className="text-tau-body text-ink-1 font-medium">已生成音频</div>
                  <div className="text-tau-sm text-ink-3">{text.trim().length} 字 · 点击试听</div>
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
