import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import { Mic, Play, Pause, RefreshCw, Check } from "lucide-react";
import { Select, Spin } from "antd";
import { TTSProviderFactory } from "@/utils/tts/TTSProviderFactory";

interface VoiceOption {
  id: string;
  name: string;
  description?: string;
}

interface TTSGenerateModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (audioBlob: Blob, text: string) => void;
}

const TTSGenerateModal: React.FC<TTSGenerateModalProps> = ({
  open,
  onCancel,
  onConfirm,
}) => {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Check if TTS is configured via TTSProviderFactory
  const isTTSConfigured =
    TTSProviderFactory.getTTSProvider()?.isConfigured() ?? false;

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
          voiceList.map((v) => ({
            id: v.id,
            name: v.name,
            description: v.description,
          })),
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
      setTimeout(() => textAreaRef.current?.focus(), 100);
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
      const audioBuffer = await provider.synthesizeSpeech(
        text.trim(),
        selectedVoiceId,
      );
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

  const handleConfirm = useMemoizedFn(() => {
    if (audioBlob && text.trim()) {
      onConfirm(audioBlob, text.trim());
    }
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [onCancel],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="remote-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="remote-modal-container w-full max-w-[520px] m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-zinc-900/95 border border-gray-200 dark:border-slate-800">
          <div className="flex items-start gap-3 mb-5">
            <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-cyan-50 dark:bg-cyan-500/20 border border-cyan-200 dark:border-cyan-500/30">
              <Mic className="w-5 h-5 text-cyan-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                文本转语音
              </h2>
              <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                输入文字，自动生成音频
              </p>
            </div>
            <button
              className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-slate-200"
              onClick={onCancel}
            >
              <svg
                className="w-[18px] h-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {!isTTSConfigured ? (
              <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400">
                <div className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-medium">语音服务未配置</p>
                    <p className="text-xs mt-1 opacity-90">
                      请先在设置中配置语音合成服务后再使用此功能
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Voice selection */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-slate-400 shrink-0">
                    音色:
                  </span>
                  <Select
                    className="flex-1"
                    value={selectedVoiceId || undefined}
                    onChange={setSelectedVoiceId}
                    placeholder="选择音色"
                    loading={voicesLoading}
                    getPopupContainer={(trigger) =>
                      trigger.parentElement || document.body
                    }
                    options={voices.map((v) => ({
                      value: v.id,
                      label: v.name,
                      title: v.description,
                    }))}
                  />
                </div>

                {/* Text input */}
                <div className="relative">
                  <textarea
                    ref={textAreaRef}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setError(null);
                    }}
                    placeholder="请输入要转换成语音的文字..."
                    rows={4}
                    className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(6,182,212,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(6,182,212,0.25)] resize-none"
                  />
                  <div className="absolute bottom-2 right-3 text-xs text-gray-400">
                    {text.length} 字
                  </div>
                </div>

                {error && (
                  <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}

                {/* Generate button */}
                <button
                  className="w-full px-5 py-3 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleGenerate}
                  disabled={!text.trim() || !selectedVoiceId || generating}
                >
                  {generating ? (
                    <>
                      <Spin size="small" />
                      生成中...
                    </>
                  ) : audioBlob ? (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      重新生成
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      生成音频
                    </>
                  )}
                </button>

                {/* Audio preview */}
                {audioUrl && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20">
                    <audio
                      ref={audioRef}
                      src={audioUrl}
                      onEnded={handleAudioEnded}
                    />
                    <button
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-cyan-500 text-white shadow-md hover:bg-cyan-600 transition-all"
                      onClick={handlePlayPause}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5 ml-0.5" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300 truncate">
                        预览生成的音频
                      </p>
                      <p className="text-xs text-cyan-600 dark:text-cyan-400 opacity-75">
                        点击播放按钮试听
                      </p>
                    </div>
                  </div>
                )}

                {/* Confirm button */}
                <button
                  className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-cyan-500 text-white shadow-[0_4px_14px_rgba(6,182,212,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-cyan-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
                  onClick={handleConfirm}
                  disabled={!audioBlob}
                >
                  <Check className="w-5 h-5" />
                  确认添加
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TTSGenerateModal;
