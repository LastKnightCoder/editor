import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw, ChevronDown } from "lucide-react";
import classNames from "classnames";
import { AudioMetaInfo, AudioChapter, BilibiliAudioMetaInfo, YouTubeAudioMetaInfo } from "@/types";
import useLocalPath from "@/hooks/useLocalPath";
import { useBilibiliAudio } from "@/hooks/useBilibiliAudio";
import { useYoutubeAudio } from "@/hooks/useYoutubeAudio";

interface AudioPlayerProps {
  metaInfo: AudioMetaInfo;
  title?: string;
  chapters?: AudioChapter[];
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
  onEnded?: () => void;
}

const playbackSpeeds = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getAudioSource(metaInfo: AudioMetaInfo): string {
  switch (metaInfo.type) {
    case "local":
      return metaInfo.filePath;
    case "remote":
      return metaInfo.url;
    case "xiaoyuzhou":
      return metaInfo.audioUrl || "";
    case "bilibili":
    case "youtube":
      return "";
  }
}

const AudioPlayer = (props: AudioPlayerProps) => {
  const {
    metaInfo,
    title: titleProp,
    chapters,
    audioRef,
    onTimeUpdate,
    onDurationChange,
    onEnded,
  } = props;

  const rawSrc = getAudioSource(metaInfo);
  const { localPath, loading: cacheLoading } = useLocalPath(rawSrc, {
    mediaType: "audio",
  });

  const bilibiliResult = useBilibiliAudio(
    metaInfo.type === "bilibili" ? (metaInfo as BilibiliAudioMetaInfo) : undefined
  );
  const youtubeResult = useYoutubeAudio(
    metaInfo.type === "youtube" ? (metaInfo as YouTubeAudioMetaInfo) : undefined
  );

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  let audioSrc: string;
  let isLoading = cacheLoading;
  let loadError: string | null = null;

  switch (metaInfo.type) {
    case "bilibili":
      audioSrc = bilibiliResult.audioUrl || "";
      isLoading = bilibiliResult.loading;
      loadError = bilibiliResult.error;
      break;
    case "youtube":
      audioSrc = youtubeResult.audioUrl || "";
      isLoading = youtubeResult.loading;
      loadError = youtubeResult.error;
      break;
    default:
      audioSrc = localPath || rawSrc;
      break;
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    };

    const handleDurationChange = () => {
      const dur = audio.duration;
      if (isFinite(dur)) {
        setDuration(dur);
        onDurationChange?.(dur);
      }
    };

    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => {
      setPlaying(false);
      onEnded?.();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioRef, onTimeUpdate, onDurationChange, onEnded]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = playbackRate;
    }
  }, [playbackRate, audioRef]);

  // Close speed menu on outside click
  useEffect(() => {
    if (!showSpeedMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSpeedMenu]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  }, [playing, audioRef]);

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.min(audio.currentTime + 10, audio.duration || 0);
    }
  }, [audioRef]);

  const skipBackward = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.max(audio.currentTime - 10, 0);
    }
  }, [audioRef]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const bar = progressRef.current;
      if (!audio || !bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
    },
    [audioRef, duration]
  );

  const selectSpeed = useCallback((speed: number) => {
    setPlaybackRate(speed);
    setShowSpeedMenu(false);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const fallbackTitle =
    metaInfo.type === "xiaoyuzhou"
      ? metaInfo.episodeTitle || "小宇宙播客"
      : metaInfo.type === "bilibili"
        ? metaInfo.title || "Bilibili 音频"
        : metaInfo.type === "youtube"
          ? metaInfo.title || "YouTube 音频"
          : metaInfo.type === "local"
            ? metaInfo.filePath.split("/").pop() || "本地音频"
            : "远程音频";

  const title = titleProp || fallbackTitle;

  const subtitle = metaInfo.type === "xiaoyuzhou" ? metaInfo.podcastName : undefined;

  const coverUrl =
    metaInfo.type === "xiaoyuzhou"
      ? metaInfo.coverUrl
      : metaInfo.type === "bilibili"
        ? metaInfo.thumbnail
        : metaInfo.type === "youtube"
          ? metaInfo.thumbnail
          : undefined;

  const downloadProgress =
    metaInfo.type === "bilibili"
      ? bilibiliResult.progress
      : metaInfo.type === "youtube"
        ? youtubeResult.progress
        : null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-zinc-700 dark:bg-zinc-800/50">
      <audio ref={audioRef} src={audioSrc} preload="metadata" />

      {/* Header: cover + title */}
      <div className="flex items-center gap-3">
        {coverUrl && (
          <img
            className="h-12 w-12 shrink-0 rounded-lg object-cover shadow-sm"
            src={coverUrl}
            alt=""
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
            {title}
          </div>
          {subtitle && (
            <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="group cursor-pointer" ref={progressRef} onClick={handleProgressClick}>
        <div className="relative flex h-3 items-center">
          <div className="absolute inset-x-0 h-1 rounded-full bg-gray-200 transition-[height] group-hover:h-1.5 dark:bg-zinc-600">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-blue-500 transition-[width] duration-100 dark:bg-blue-400"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Playback indicator dot */}
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 dark:bg-blue-400"
            style={{ left: `${progress}%` }}
          />
          {/* Chapter markers */}
          {chapters && chapters.length > 0 && duration > 0 && (
            <>
              {chapters.map(ch => {
                const pos = (ch.startTime / 1000 / duration) * 100;
                return (
                  <div
                    key={ch.id}
                    className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-gray-400/60 dark:bg-gray-500/60"
                    style={{ left: `${pos}%` }}
                    title={ch.title}
                  />
                );
              })}
            </>
          )}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[11px] text-gray-500 dark:text-gray-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-zinc-700"
          onClick={skipBackward}
          title="后退 10s"
        >
          <RotateCcw size={20} />
          <span className="absolute text-[8px] font-bold leading-none">10</span>
        </button>
        <button
          className={classNames(
            "flex items-center justify-center rounded-full transition-colors",
            "h-11 w-11 bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] shadow-md hover:bg-[var(--th-btn-hover)] dark:bg-blue-500 dark:hover:bg-blue-400"
          )}
          onClick={togglePlay}
        >
          {playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
        </button>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-zinc-700"
          onClick={skipForward}
          title="前进 10s"
        >
          <RotateCw size={20} />
          <span className="absolute text-[8px] font-bold leading-none">10</span>
        </button>

        {/* Speed dropdown */}
        <div className="relative" ref={speedMenuRef}>
          <button
            className="flex items-center gap-0.5 rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-600 dark:text-gray-300 dark:hover:bg-zinc-700"
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
          >
            {playbackRate}x
            <ChevronDown size={12} />
          </button>
          {showSpeedMenu && (
            <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-800">
              {playbackSpeeds.map(speed => (
                <button
                  key={speed}
                  className={classNames(
                    "block w-full whitespace-nowrap px-4 py-1.5 text-left text-xs transition-colors",
                    speed === playbackRate
                      ? "bg-blue-50 font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-700"
                  )}
                  onClick={() => selectSpeed(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Loading/download progress overlay */}
      {(isLoading || loadError || downloadProgress) && (
        <div className="text-center text-xs text-gray-500 dark:text-gray-400">
          {loadError ? (
            <span className="text-red-500 dark:text-red-400">{loadError}</span>
          ) : (
            downloadProgress?.message || "加载中..."
          )}
        </div>
      )}
    </div>
  );
};

export default AudioPlayer;
