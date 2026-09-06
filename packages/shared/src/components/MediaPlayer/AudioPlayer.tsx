import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { AudioLines } from "lucide-react";
import ProgressBar from "./ProgressBar";
import { formatTime } from "./formatTime";
import { useMediaController } from "./useMediaController";
import { PlayButton, RateMenu, TimeCode, VolumeControl } from "./MediaControls";

export interface AudioPlayerProps extends React.AudioHTMLAttributes<HTMLAudioElement> {
  /** 卡片首行标题，默认从 src 提取文件名 */
  label?: string;
}

/** 均衡器律动条的关键帧（内联注入，避免依赖全局样式入口） */
const EQ_KEYFRAMES =
  "@keyframes media-eq{0%,100%{transform:scaleY(.35)}25%{transform:scaleY(1)}50%{transform:scaleY(.45)}75%{transform:scaleY(.85)}}";
const EQ_DELAYS = ["220ms", "100ms", "320ms", "0ms"];

/** 播放中的律动均衡器（4 根音条，错峰跳动） */
const EqualizerBars = () => (
  <span className="flex h-5 items-end gap-[3px]" aria-hidden>
    <style>{EQ_KEYFRAMES}</style>
    {EQ_DELAYS.map(delay => (
      <span
        key={delay}
        className="w-[3px] rounded-full bg-current"
        style={{
          height: "100%",
          transformOrigin: "bottom",
          animation: "media-eq 1.05s ease-in-out infinite",
          animationDelay: delay,
        }}
      />
    ))}
  </span>
);

/** 从媒体地址提取文件名作为标题 */
const deriveLabel = (src: string): string => {
  if (!src || src.startsWith("data:")) {
    return "音频";
  }
  try {
    const url = new URL(src);
    const name = decodeURIComponent(url.pathname.split("/").pop() || "");
    return name || "音频";
  } catch {
    const clean = src.split("?")[0].split("#")[0];
    try {
      const name = decodeURIComponent(clean.split("/").pop() || "");
      return name || "音频";
    } catch {
      return "音频";
    }
  }
};

const AudioPlayer = forwardRef<HTMLAudioElement, AudioPlayerProps>(
  (
    {
      src,
      label,
      className,
      // 自定义控制条始终接管，忽略原生 controls
      controls: _controls,
      children,
      ...rest
    },
    ref
  ) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const setAudioRefs = useCallback(
      (element: HTMLAudioElement | null) => {
        audioRef.current = element;
        if (typeof ref === "function") {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
      },
      [ref]
    );

    const {
      playing,
      currentTime,
      duration,
      bufferedEnd,
      volume,
      muted,
      togglePlay,
      seek,
      setVolume,
      setMuted,
    } = useMediaController(audioRef);

    // 媒体重新加载（换 src）后 playbackRate 会重置，需在元数据就绪时恢复
    const [rate, setRate] = useState(1);
    const rateRef = useRef(rate);
    useEffect(() => {
      rateRef.current = rate;
    }, [rate]);
    useEffect(() => {
      const audio = audioRef.current;
      if (audio) {
        audio.playbackRate = rate;
      }
    }, [rate]);

    const handleLoadedMetadata = useCallback(() => {
      const audio = audioRef.current;
      if (audio) {
        audio.playbackRate = rateRef.current;
      }
    }, []);

    // ---- 进度条两段式：拖动预览，松手定档 ----
    const [scrubTime, setScrubTime] = useState<number | null>(null);
    const displayTime = scrubTime ?? currentTime;

    const lastVolumeRef = useRef(1);
    useEffect(() => {
      if (volume > 0) {
        lastVolumeRef.current = volume;
      }
    }, [volume]);
    const toggleMute = useCallback(() => {
      if (muted || volume === 0) {
        setMuted(false);
        setVolume(lastVolumeRef.current || 1);
      } else {
        setMuted(true);
      }
    }, [muted, setMuted, setVolume, volume]);

    const title = label ?? deriveLabel(src ?? "");

    return (
      <div
        className={classNames(
          "flex select-none items-center gap-3.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 dark:border-zinc-700 dark:bg-zinc-800/50",
          className
        )}
      >
        {/* 音纹图标：播放中切换为律动均衡器 */}
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-gray-200/80 text-gray-600 dark:bg-zinc-700/60 dark:text-zinc-300"
        >
          {playing ? <EqualizerBars /> : <AudioLines size={19} />}
        </span>

        <div className="min-w-0 flex-1">
          {/* 首行：标题 */}
          <div className="mb-1.5 truncate text-sm font-medium text-gray-800 dark:text-zinc-200">
            {title}
          </div>
          {/* 次行：控件 */}
          <div className="flex items-center gap-2.5">
            <PlayButton playing={playing} onToggle={togglePlay} tone="light" />
            <TimeCode tone="light">{formatTime(displayTime)}</TimeCode>
            <ProgressBar
              tone="light"
              className="min-w-12 flex-1"
              value={duration > 0 ? displayTime / duration : 0}
              buffered={duration > 0 && bufferedEnd > 0 ? bufferedEnd / duration : undefined}
              onScrub={next => setScrubTime(next * duration)}
              onCommit={next => {
                seek(next * duration);
                setScrubTime(null);
              }}
            />
            <TimeCode tone="light">{formatTime(duration)}</TimeCode>
            <VolumeControl
              tone="light"
              volume={volume}
              muted={muted}
              onVolumeChange={next => {
                setMuted(false);
                setVolume(next);
              }}
              onToggleMute={toggleMute}
            />
            <RateMenu tone="light" rate={rate} onRateChange={setRate} />
          </div>
        </div>

        <audio
          ref={setAudioRefs}
          src={src}
          preload="metadata"
          hidden
          onLoadedMetadata={handleLoadedMetadata}
          {...rest}
        >
          {children}
        </audio>
      </div>
    );
  }
);

AudioPlayer.displayName = "AudioPlayer";

export default AudioPlayer;
