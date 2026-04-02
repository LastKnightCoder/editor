import useLocalPath from "@/hooks/useLocalPath";
import { useCallback, useEffect, useRef, useState } from "react";
import { IPodcast, PodcastScriptLine } from "@/types/podcast";
import useTheme from "@/hooks/useTheme";
import CustomModal from "@/components/CustomModal";
import ConfirmDialog from "@/components/CustomModal/ConfirmDialog";
import {
  ChevronRight,
  Download,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  PlayCircle,
  ScrollText,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

interface PodCastPlayerProps {
  defaultPodcast: IPodcast;
  onDelete?: () => void;
  onEdit?: () => void;
  /** 紧凑模式，用于列表显示 */
  compact?: boolean;
}

const playbackSpeeds = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const PodCastPlayer = (props: PodCastPlayerProps) => {
  const { defaultPodcast, onDelete, onEdit, compact = false } = props;
  const podcast = defaultPodcast;
  const { localPath, loading } = useLocalPath(podcast.audioUrl, {
    mediaType: "audio",
  });

  const [scriptDetailOpen, setScriptDetailOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const { isDark } = useTheme();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [muted, setMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  useEffect(() => {
    if (!menuOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!menuContainerRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // ignore
    }
    audio.load();
  }, [localPath]);

  const downloadAudio = useCallback(async () => {
    const src = localPath;
    if (!src) return;

    const defaultName = podcast.name ? `${podcast.name}.wav` : "audio.wav";
    let filename = defaultName;
    try {
      const url = new URL(src);
      const last = url.pathname.split("/").pop();
      if (last) filename = last;
    } catch {
      // ltoh 协议或非标准 URL，保持默认文件名
    }

    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [localPath, podcast.name]);

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setMuted(false);
    setVolume(newVolume);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch((err) => {
        console.warn("[PodcastPlayer] 播放失败", err);
      });
    } else {
      audio.pause();
    }
  };

  const syncTimeState = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    setCurrentTime(audio.currentTime || 0);
    setDuration(dur);
  }, []);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = time;
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div
        className={`w-full ${compact ? "py-2" : "my-2"} mx-auto flex items-center justify-center`}
      >
        <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
      </div>
    );
  }

  // 紧凑模式：只显示播放按钮、进度条和时间
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <audio
          ref={audioRef}
          src={localPath}
          className="hidden"
          preload="metadata"
          onLoadedMetadata={syncTimeState}
          onDurationChange={syncTimeState}
          onTimeUpdate={syncTimeState}
          onSeeking={syncTimeState}
          onSeeked={syncTimeState}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            console.warn("[PodcastPlayer] 音频加载失败", localPath);
          }}
        />
        <button
          onClick={togglePlay}
          className="flex items-center justify-center rounded-full cursor-pointer shrink-0"
          style={{ color: isDark ? "#6666ff" : "#3311db" }}
        >
          {playing ? (
            <PauseCircle className="h-6 w-6" />
          ) : (
            <PlayCircle className="h-6 w-6" />
          )}
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right shrink-0">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min="0"
          max={duration || 1}
          step="0.1"
          value={currentTime}
          onChange={handleSeek}
          style={{
            background: `linear-gradient(to right, ${
              isDark ? "#6666ff" : "#3311db"
            } 0%, ${isDark ? "#6666ff" : "#3311db"} ${(currentTime / (duration || 1)) * 100}%, ${
              isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"
            } ${(currentTime / (duration || 1)) * 100}%, ${
              isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"
            } 100%)`,
          }}
          className="flex-1 cursor-pointer h-1 rounded-full appearance-none transition-all hover:h-1.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-indigo-500 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-indigo-500 [&::-moz-range-thumb]:border-0"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400 w-8 shrink-0">
          {formatTime(duration)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border border-[#f0f0f0] dark:border-[#202020] rounded-md p-5 mb-8 relative">
      <audio
        ref={audioRef}
        src={localPath}
        className="hidden"
        preload="metadata"
        onLoadedMetadata={syncTimeState}
        onDurationChange={syncTimeState}
        onTimeUpdate={syncTimeState}
        onSeeking={syncTimeState}
        onSeeked={syncTimeState}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          console.warn("[PodcastPlayer] 音频加载失败", localPath);
        }}
      />
      <div className="flex justify-between items-center px-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={togglePlay}
            className={`flex items-center justify-center rounded-full cursor-pointer`}
            style={{ color: isDark ? "#6666ff" : "#3311db" }}
          >
            {playing ? (
              <PauseCircle className="h-7 w-7 " />
            ) : (
              <PlayCircle className="h-7 w-7 " />
            )}
          </button>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-base font-medium">
                {podcast.name || "未命名播客"}
              </div>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {podcast.speakers.map((speaker) => speaker.name).join(", ")}
            </div>
          </div>
        </div>
        <div ref={menuContainerRef} className="relative">
          <button
            type="button"
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="更多"
          >
            <MoreHorizontal className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 shadow-lg p-1.5 transition-all">
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit?.();
                }}
              >
                <Pencil className="w-4 h-4" />
                <span>编辑播客</span>
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  setScriptDetailOpen(true);
                }}
              >
                <ScrollText className="w-4 h-4" />
                <span>脚本详情</span>
              </button>

              <div className="my-1.5 h-px bg-gray-200 dark:bg-zinc-700" />

              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                onClick={() => setSpeedMenuOpen((v) => !v)}
              >
                <Zap className="w-4 h-4" />
                <span className="flex-1 text-left">播放速度</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {playbackRate.toFixed(2)}x
                </span>
                <ChevronRight
                  className={`w-4 h-4 transition-transform ${speedMenuOpen ? "rotate-90" : ""}`}
                />
              </button>

              {speedMenuOpen && (
                <div className="px-2 py-2 grid grid-cols-4 gap-1.5 bg-gray-50 dark:bg-zinc-800/50 rounded-lg mx-2 mb-1.5">
                  {playbackSpeeds.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                        speed === playbackRate
                          ? "bg-indigo-600 text-white shadow-sm scale-105"
                          : "bg-white dark:bg-zinc-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:scale-105"
                      }`}
                      onClick={() => {
                        setPlaybackRate(speed);
                      }}
                    >
                      {speed.toFixed(1)}x
                    </button>
                  ))}
                </div>
              )}

              <div className="my-1.5 h-px bg-gray-200 dark:bg-zinc-700" />

              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  downloadAudio().catch((err) => {
                    console.warn("[PodcastPlayer] 下载失败", err);
                  });
                }}
              >
                <Download className="w-4 h-4" />
                <span>下载音频</span>
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteConfirmOpen(true);
                }}
              >
                <Trash2 className="w-4 h-4" />
                <span>删除播客</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 mb-4">
        <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right shrink-0">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min="0"
          max={duration || 1}
          step="0.1"
          value={currentTime}
          onChange={handleSeek}
          style={{
            background: `linear-gradient(to right, ${
              isDark ? "#6666ff" : "#3311db"
            } 0%, ${isDark ? "#6666ff" : "#3311db"} ${(currentTime / (duration || 1)) * 100}%, ${
              isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"
            } ${(currentTime / (duration || 1)) * 100}%, ${
              isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"
            } 100%)`,
          }}
          className="flex-1 cursor-pointer h-1.5 rounded-full appearance-none transition-all hover:h-2 focus:h-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-all hover:[&::-webkit-slider-thumb]:w-4 hover:[&::-webkit-slider-thumb]:h-4 hover:[&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 dark:[&::-webkit-slider-thumb]:border-indigo-500 [&::-webkit-slider-thumb]:border-indigo-600 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:transition-all hover:[&::-moz-range-thumb]:w-4 hover:[&::-moz-range-thumb]:h-4 hover:[&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:border-2 dark:[&::-moz-range-thumb]:border-indigo-500 [&::-moz-range-thumb]:border-indigo-600 [&::-moz-range-thumb]:border-0"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400 w-10 shrink-0">
          {formatTime(duration)}
        </span>
        <div
          style={{ color: isDark ? "#6666ff" : "#3311db" }}
          className="shrink-0 ml-2 cursor-pointer transition-all hover:scale-110 active:scale-95"
          onClick={() => setMuted((v) => !v)}
        >
          {muted || volume === 0 ? (
            <VolumeX className="h-5 w-5" />
          ) : (
            <Volume2 className="h-5 w-5" />
          )}
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={muted ? 0 : volume}
          onChange={handleVolume}
          style={{
            background: `linear-gradient(to right, ${
              isDark ? "#6666ff" : "#3311db"
            } 0%, ${isDark ? "#6666ff" : "#3311db"} ${(muted ? 0 : volume) * 100}%, ${
              isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"
            } ${(muted ? 0 : volume) * 100}%, ${
              isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"
            } 100%)`,
          }}
          className="w-16 cursor-pointer shrink-0 h-1.5 rounded-full appearance-none transition-all hover:h-2 focus:h-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-all hover:[&::-webkit-slider-thumb]:w-4 hover:[&::-webkit-slider-thumb]:h-4 hover:[&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 dark:[&::-webkit-slider-thumb]:border-indigo-500 [&::-webkit-slider-thumb]:border-indigo-600 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:transition-all hover:[&::-moz-range-thumb]:w-4 hover:[&::-moz-range-thumb]:h-4 hover:[&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:border-2 dark:[&::-moz-range-thumb]:border-indigo-500 [&::-moz-range-thumb]:border-indigo-600 [&::-moz-range-thumb]:border-0"
        />
      </div>
      <CustomModal
        open={scriptDetailOpen}
        onCancel={() => setScriptDetailOpen(false)}
        footer={null}
        title="脚本详情"
        width={800}
        contentClassName="p-0"
      >
        <div
          style={{
            maxHeight: "calc(100vh - 200px)",
            height: 600,
            overflow: "hidden",
          }}
        >
          <div className="overflow-y-auto flex flex-col gap-3 p-4 rounded whitespace-pre-wrap max-h-full">
            {podcast.scriptLines && podcast.scriptLines.length > 0 ? (
              <div className="flex flex-col gap-4">
                {podcast.scriptLines.map(
                  (line: PodcastScriptLine, index: number) => (
                    <div key={index} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-600">
                          {line.speaker}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTime(line.startTime)}
                        </span>
                      </div>
                      <div className="text-gray-800">{line.text}</div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              podcast.script
                .split("\n")
                .map((line, index) => <div key={index}>{line}</div>)
            )}
          </div>
        </div>
      </CustomModal>
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="删除播客"
        description="确定要删除该播客吗？"
        danger
        confirmText="删除"
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          onDelete?.();
        }}
      />
    </div>
  );
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default PodCastPlayer;
