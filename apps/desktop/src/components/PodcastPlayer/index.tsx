import useLocalPath from "@/hooks/useLocalPath";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { IPodcast, PodcastScriptLine } from "@/types/podcast";
import { ConfirmDialog, Dialog, IconButton, Menu, Spinner, Tooltip, cn } from "@tau/ui";
import {
  Download,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
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

/**
 * 滑条：accent 填充 + line-1 轨道（硬停色标，非渐变观感），圆钮 accent 实心 + surface 描边。
 * 填充比例由内联 CSS 变量 --v 传入；悬停不改变轨道 / 圆钮尺寸。
 */
const sliderClass = cn(
  "h-1 cursor-pointer appearance-none rounded-full outline-none",
  "bg-[linear-gradient(to_right,var(--tau-accent)_0_var(--v),var(--tau-line-1)_var(--v)_100%)]",
  "[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
  "[&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:ring-surface [&::-webkit-slider-thumb]:ring-2",
  "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0",
  "[&::-moz-range-thumb]:bg-accent",
  "focus-visible:[&::-webkit-slider-thumb]:ring-accent-soft"
);

const sliderStyle = (ratio: number) =>
  ({ "--v": `${Math.min(Math.max(ratio, 0), 1) * 100}%` }) as CSSProperties;

const iconProps = { className: "size-4", strokeWidth: 1.75 } as const;

const PodCastPlayer = (props: PodCastPlayerProps) => {
  const { defaultPodcast, onDelete, onEdit, compact = false } = props;
  const podcast = defaultPodcast;
  const { localPath, loading } = useLocalPath(podcast.audioUrl, {
    mediaType: "audio",
  });

  const [scriptDetailOpen, setScriptDetailOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [muted, setMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

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
      audio.play().catch(err => {
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
        className={cn("mx-auto flex w-full items-center justify-center", compact ? "py-2" : "my-2")}
      >
        <Spinner className="text-ink-3 size-4" />
      </div>
    );
  }

  const audioEl = (
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
  );

  const progressRatio = currentTime / (duration || 1);
  const progressSlider = (className: string) => (
    <input
      type="range"
      min="0"
      max={duration || 1}
      step="0.1"
      value={currentTime}
      onChange={handleSeek}
      aria-label="播放进度"
      style={sliderStyle(progressRatio)}
      className={cn(sliderClass, className)}
    />
  );

  // 紧凑模式：只显示播放按钮、进度条和时间
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {audioEl}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "暂停" : "播放"}
          className="bg-accent text-accent-text grid size-6 shrink-0 cursor-pointer place-items-center rounded-full"
        >
          {playing ? (
            <Pause className="size-3" strokeWidth={2} fill="currentColor" />
          ) : (
            <Play className="size-3 translate-x-[1px]" strokeWidth={2} fill="currentColor" />
          )}
        </button>
        <span className="text-ink-3 text-tau-micro w-8 shrink-0 text-right tabular-nums">
          {formatTime(currentTime)}
        </span>
        {progressSlider("min-w-0 flex-1")}
        <span className="text-ink-3 text-tau-micro w-8 shrink-0 tabular-nums">
          {formatTime(duration)}
        </span>
      </div>
    );
  }

  const volumeValue = muted ? 0 : volume;

  return (
    <div className="border-line-1 bg-surface rounded-tau-lg relative mb-8 flex flex-col gap-3 border px-5 py-4">
      {audioEl}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "暂停" : "播放"}
          className="bg-accent text-accent-text grid size-9 shrink-0 cursor-pointer place-items-center rounded-full"
        >
          {playing ? (
            <Pause className="size-4" strokeWidth={2} fill="currentColor" />
          ) : (
            <Play className="size-4 translate-x-[1px]" strokeWidth={2} fill="currentColor" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="text-ink-1 text-tau-body truncate font-medium">
            {podcast.name || "未命名播客"}
          </div>
          <div className="text-ink-3 text-tau-meta truncate">
            {podcast.speakers.map(speaker => speaker.name).join(", ")}
          </div>
        </div>
        <Menu
          align="end"
          className="w-56"
          trigger={
            <IconButton aria-label="更多" className="shrink-0">
              <MoreHorizontal {...iconProps} />
            </IconButton>
          }
        >
          <Menu.Item icon={<Pencil {...iconProps} />} onSelect={() => onEdit?.()}>
            编辑播客
          </Menu.Item>
          <Menu.Item
            icon={<ScrollText {...iconProps} />}
            onSelect={() => setScriptDetailOpen(true)}
          >
            脚本详情
          </Menu.Item>
          <Menu.Separator />
          <Menu.Submenu
            icon={<Zap {...iconProps} />}
            label={
              <span className="flex items-center gap-2">
                <span className="flex-1">播放速度</span>
                <span className="text-ink-3 text-tau-meta tabular-nums">
                  {playbackRate.toFixed(2)}x
                </span>
              </span>
            }
          >
            <Menu.RadioGroup
              value={String(playbackRate)}
              onValueChange={v => setPlaybackRate(Number(v))}
            >
              {playbackSpeeds.map(speed => (
                <Menu.RadioItem key={speed} value={String(speed)}>
                  <span className="tabular-nums">{speed.toFixed(2)}x</span>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Submenu>
          <Menu.Separator />
          <Menu.Item
            icon={<Download {...iconProps} />}
            onSelect={() => {
              downloadAudio().catch(err => {
                console.warn("[PodcastPlayer] 下载失败", err);
              });
            }}
          >
            下载音频
          </Menu.Item>
          <Menu.Item
            danger
            icon={<Trash2 {...iconProps} />}
            onSelect={() => setDeleteConfirmOpen(true)}
          >
            删除播客
          </Menu.Item>
        </Menu>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-ink-3 text-tau-micro w-10 shrink-0 text-right tabular-nums">
          {formatTime(currentTime)}
        </span>
        {progressSlider("min-w-0 flex-1")}
        <span className="text-ink-3 text-tau-micro w-10 shrink-0 tabular-nums">
          {formatTime(duration)}
        </span>
        <Tooltip content={muted || volume === 0 ? "取消静音" : "静音"}>
          <IconButton
            aria-label={muted || volume === 0 ? "取消静音" : "静音"}
            className="ml-1 size-7 shrink-0"
            onClick={() => setMuted(v => !v)}
          >
            {muted || volume === 0 ? <VolumeX {...iconProps} /> : <Volume2 {...iconProps} />}
          </IconButton>
        </Tooltip>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volumeValue}
          onChange={handleVolume}
          aria-label="音量"
          style={sliderStyle(volumeValue)}
          className={cn(sliderClass, "w-16 shrink-0")}
        />
      </div>
      <Dialog
        open={scriptDetailOpen}
        onOpenChange={setScriptDetailOpen}
        title="脚本详情"
        icon={<ScrollText {...iconProps} />}
        context={podcast.name || undefined}
        width={800}
      >
        {podcast.scriptLines && podcast.scriptLines.length > 0 ? (
          <div className="flex flex-col gap-4">
            {podcast.scriptLines.map((line: PodcastScriptLine, index: number) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-ink-2 text-tau-meta font-semibold">{line.speaker}</span>
                  <span className="text-ink-3 text-tau-micro tabular-nums">
                    {formatTime(line.startTime)}
                  </span>
                </div>
                <div className="text-ink-1 text-tau-body whitespace-pre-wrap">{line.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-ink-1 text-tau-body flex flex-col gap-3 whitespace-pre-wrap">
            {podcast.script.split("\n").map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="删除播客"
        description="确定要删除该播客吗？"
        context={podcast.name || undefined}
        danger
        confirmText="删除"
        onConfirm={() => {
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
