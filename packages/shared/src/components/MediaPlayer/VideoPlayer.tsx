import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { AnimatePresence, motion } from "motion/react";
import { FastForward, LoaderCircle, Play } from "lucide-react";
import ProgressBar from "./ProgressBar";
import { formatTime } from "./formatTime";
import { useMediaController } from "./useMediaController";
import { FullscreenToggle, PlayButton, RateMenu, TimeCode, VolumeControl } from "./MediaControls";

export interface VideoPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  /** 长按加速倍率，默认 2；设为 0 关闭长按加速 */
  longPressRate?: number;
  /** 基础播放速率。React 原生类型未收录该属性，这里显式支持并真正写入媒体元素 */
  playbackRate?: number;
}

const LONG_PRESS_DELAY = 400;
/** 长按松开后的短暂时间窗内忽略 click，避免误触发播放/暂停 */
const SUPPRESS_CLICK_MS = 350;

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  (
    {
      src,
      className,
      style,
      // 自定义控制条始终接管，忽略原生 controls；宽度由容器布局决定
      controls: _controls,
      width: _width,
      playbackRate,
      longPressRate = 2,
      onClick,
      onDoubleClick,
      onLoadedMetadata,
      onPointerDown,
      children,
      ...rest
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const setVideoRefs = useCallback(
      (element: HTMLVideoElement | null) => {
        videoRef.current = element;
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
      waiting,
      togglePlay,
      seek,
      setVolume,
      setMuted,
    } = useMediaController(videoRef);

    // ---- 宽高比：加载前 16:9 占位，元数据就绪后按视频真实比例钉住 ----
    const [aspectRatio, setAspectRatio] = useState("16 / 9");

    // ---- 倍速：baseRate 为常规播放速率，长按加速在其基础上临时翻倍 ----
    const [baseRate, setBaseRate] = useState(playbackRate ?? 1);
    const baseRateRef = useRef(baseRate);
    useEffect(() => {
      baseRateRef.current = baseRate;
    }, [baseRate]);

    // 节点属性 playbackRate 受控同步（同时修复 React 直接写 attribute 不生效的问题）
    useEffect(() => {
      if (playbackRate != null && playbackRate > 0) {
        setBaseRate(playbackRate);
      }
    }, [playbackRate]);

    useEffect(() => {
      const video = videoRef.current;
      if (video && !speedUpRef.current) {
        video.playbackRate = baseRate;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseRate]);

    const handleLoadedMetadata = useCallback(
      (event: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        const video = event.currentTarget;
        if (video.videoWidth && video.videoHeight) {
          setAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
        }
        // 换源后 playbackRate 会被重置，元数据就绪时恢复
        video.playbackRate = baseRateRef.current;
        onLoadedMetadata?.(event);
      },
      [onLoadedMetadata]
    );

    // ---- 长按加速 ----
    const [speedUp, setSpeedUp] = useState(false);
    const speedUpRef = useRef(false);
    const pressTimerRef = useRef<number | undefined>(undefined);
    const suppressClickUntilRef = useRef(0);

    const activateSpeedUp = useCallback(() => {
      speedUpRef.current = true;
      setSpeedUp(true);
      const video = videoRef.current;
      if (!video) {
        return;
      }
      if (video.paused) {
        void video.play().catch(() => undefined);
      }
      video.playbackRate = baseRateRef.current * longPressRate;
    }, [longPressRate]);

    const deactivateSpeedUp = useCallback(() => {
      if (!speedUpRef.current) {
        return;
      }
      speedUpRef.current = false;
      setSpeedUp(false);
      suppressClickUntilRef.current = performance.now() + SUPPRESS_CLICK_MS;
      const video = videoRef.current;
      if (video) {
        video.playbackRate = baseRateRef.current;
      }
    }, []);

    const clearLongPress = useCallback(() => {
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = undefined;
      }
      deactivateSpeedUp();
    }, [deactivateSpeedUp]);

    useEffect(() => {
      return () => {
        if (pressTimerRef.current) {
          window.clearTimeout(pressTimerRef.current);
        }
      };
    }, []);

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button === 0 && longPressRate > 0) {
          if (pressTimerRef.current) {
            window.clearTimeout(pressTimerRef.current);
          }
          pressTimerRef.current = window.setTimeout(activateSpeedUp, LONG_PRESS_DELAY);
        }
      },
      [activateSpeedUp, longPressRate]
    );

    // ---- 播放/暂停 ----
    // 播放中点击画面暂停；暂停时整个画面被覆盖按钮接管，点击任意处播放
    const handleVideoClick = useCallback(
      (event: React.MouseEvent<HTMLVideoElement>) => {
        if (performance.now() < suppressClickUntilRef.current) {
          event.stopPropagation();
          return;
        }
        togglePlay();
        onClick?.(event);
      },
      [onClick, togglePlay]
    );

    const toggleFullscreen = useCallback(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void container.requestFullscreen().catch(() => undefined);
      }
    }, []);

    // ---- 进度条两段式：拖动预览，松手定档 ----
    const [scrubTime, setScrubTime] = useState<number | null>(null);
    const displayTime = scrubTime ?? currentTime;
    const progress = duration > 0 ? displayTime / duration : 0;

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

    return (
      <div
        ref={containerRef}
        className={classNames(
          "group/video relative block select-none overflow-hidden bg-black",
          className
        )}
        style={style}
        onPointerDown={handlePointerDown}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        onContextMenu={event => {
          if (speedUpRef.current) {
            event.preventDefault();
          }
        }}
      >
        <video
          ref={setVideoRefs}
          src={src}
          playsInline
          preload="metadata"
          className="block aspect-video w-full object-contain"
          style={{ aspectRatio }}
          onClick={handleVideoClick}
          onDoubleClick={event => {
            toggleFullscreen();
            onDoubleClick?.(event);
          }}
          onLoadedMetadata={handleLoadedMetadata}
          onPointerDown={onPointerDown}
          {...rest}
        >
          {children}
        </video>

        {/* 暂停时整个画面可点击播放（加载中显示旋转指示） */}
        {!playing && (
          <button
            type="button"
            title="播放"
            aria-label="播放"
            className="absolute inset-0 grid place-items-center outline-none"
            onClick={togglePlay}
          >
            {waiting ? (
              <LoaderCircle size={36} className="animate-spin text-white/90" />
            ) : (
              <span className="grid size-16 place-items-center rounded-full bg-white/90 text-gray-900 shadow-lg backdrop-blur transition-transform hover:scale-105">
                <Play size={24} className="translate-x-[2px]" fill="currentColor" />
              </span>
            )}
          </button>
        )}

        {/* 播放中的加载指示 */}
        {playing && waiting && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <LoaderCircle size={32} className="animate-spin text-white/90" />
          </div>
        )}

        {/* 长按加速徽标 */}
        <AnimatePresence>
          {speedUp && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: -6 }}
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
              className="pointer-events-none absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1.5 text-sm font-semibold text-white shadow-xl backdrop-blur-md"
            >
              {longPressRate}x
              <FastForward size={14} fill="currentColor" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 控件条：暂停或拖拽时常驻，播放中悬停/聚焦浮现 */}
        <div
          className={classNames(
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-10 transition-opacity duration-200",
            playing && scrubTime === null
              ? "opacity-0 focus-within:opacity-100 group-hover/video:opacity-100"
              : "opacity-100"
          )}
          onPointerDown={event => {
            // 控件交互不触发长按加速
            event.stopPropagation();
          }}
        >
          <ProgressBar
            tone="dark"
            className="mb-1.5"
            value={progress}
            buffered={duration > 0 ? bufferedEnd / duration : undefined}
            onScrub={next => setScrubTime(next * duration)}
            onCommit={next => {
              seek(next * duration);
              setScrubTime(null);
            }}
            renderTooltip={next => formatTime(next * duration)}
          />
          <div className="flex items-center gap-1.5 text-white">
            <PlayButton playing={playing} onToggle={togglePlay} tone="dark" />
            <TimeCode tone="dark">
              {formatTime(displayTime)} / {formatTime(duration)}
            </TimeCode>
            <div className="flex-1" />
            <VolumeControl
              tone="dark"
              volume={volume}
              muted={muted}
              onVolumeChange={next => {
                setMuted(false);
                setVolume(next);
              }}
              onToggleMute={toggleMute}
            />
            <RateMenu tone="dark" rate={baseRate} onRateChange={setBaseRate} />
            <FullscreenToggle containerRef={containerRef} />
          </div>
        </div>
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
