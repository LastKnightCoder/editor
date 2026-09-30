import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@tau/ui";
import { AnimatePresence, motion } from "motion/react";
import { FastForward, History, LoaderCircle, Play } from "lucide-react";
import ProgressBar from "./ProgressBar";
import { formatTime } from "./formatTime";
import { useMediaController } from "./useMediaController";
import { useFramePreview } from "./useFramePreview";
import { usePlaybackResume } from "./usePlaybackResume";
import { resolveVideoShortcut, stepPlaybackRate } from "./videoShortcuts";
import {
  FullscreenToggle,
  PipButton,
  PlayButton,
  RateMenu,
  TimeCode,
  VolumeControl,
} from "./MediaControls";

export interface VideoPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  /** 长按加速倍率，默认 2；设为 0 关闭长按加速 */
  longPressRate?: number;
  /** 基础播放速率。React 原生类型未收录该属性，这里显式支持并真正写入媒体元素 */
  playbackRate?: number;
  /** 用户经菜单或快捷键改了倍速时回调，宿主据此持久化（如写回编辑器节点） */
  onPlaybackRateChange?: (rate: number) => void;
  /** 底栏信息位（来源、标题等），窄宽度下收起 */
  info?: React.ReactNode;
  /** 播放位置持久化键，传入即启用续播（打开时跳回上次位置并提示） */
  persistKey?: string;
  /** 进度条悬停帧预览，默认开启 */
  framePreview?: boolean;
}

const LONG_PRESS_DELAY = 400;
/** 长按松开后的短暂时间窗内忽略 click，避免误触发播放/暂停 */
const SUPPRESS_CLICK_MS = 350;
/** 全屏时指针静置多久收起胶囊 */
const IDLE_HIDE_MS = 2000;
const OSD_DURATION_MS = 700;
const FRAME_SECONDS = 1 / 30;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const noop = () => undefined;

const isTextInput = (element: HTMLElement) =>
  element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName);

/**
 * 视频播放器：常态是纸面卡片 + 画面下方的底栏（控件不遮画面），
 * 全屏时底栏换成画面内的深色胶囊，静置后完全收起、只留底边进度细线。
 * 聚焦后支持键盘快捷键（见 videoShortcuts），操作结果以画面中央的 OSD 反馈。
 */
const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  (
    {
      src,
      className,
      style,
      // 自定义控件始终接管，忽略原生 controls；尺寸由容器布局决定
      controls: _controls,
      width: _width,
      height: _height,
      playbackRate,
      onPlaybackRateChange,
      longPressRate = 2,
      info,
      persistKey,
      framePreview = true,
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

    const resume = usePlaybackResume(videoRef, persistKey);

    // ---- 宽高比：加载前 16:9 占位，元数据就绪后按视频真实比例钉住 ----
    const [aspectRatio, setAspectRatio] = useState("16 / 9");
    const [hasPicture, setHasPicture] = useState(false);

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

    const changeRate = useCallback(
      (rate: number) => {
        setBaseRate(rate);
        onPlaybackRateChange?.(rate);
      },
      [onPlaybackRateChange]
    );

    const handleLoadedMetadata = useCallback(
      (event: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        const video = event.currentTarget;
        const picture = !!(video.videoWidth && video.videoHeight);
        setHasPicture(picture);
        if (picture) {
          setAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
        }
        // 换源后 playbackRate 会被重置，元数据就绪时恢复
        video.playbackRate = baseRateRef.current;
        onLoadedMetadata?.(event);
      },
      [onLoadedMetadata]
    );

    // ---- 全屏 / 画中画 ----
    const [fullscreen, setFullscreen] = useState(false);
    useEffect(() => {
      const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
      document.addEventListener("fullscreenchange", onChange);
      return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const toggleFullscreen = useCallback(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(noop);
      } else {
        void container.requestFullscreen?.().catch(noop);
      }
    }, []);

    const pipSupported = useMemo(
      () => typeof document !== "undefined" && !!document.pictureInPictureEnabled,
      []
    );
    const [pip, setPip] = useState(false);
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !pipSupported) {
        return;
      }
      const onEnter = () => setPip(true);
      const onLeave = () => setPip(false);
      video.addEventListener("enterpictureinpicture", onEnter);
      video.addEventListener("leavepictureinpicture", onLeave);
      return () => {
        video.removeEventListener("enterpictureinpicture", onEnter);
        video.removeEventListener("leavepictureinpicture", onLeave);
      };
    }, [pipSupported]);

    const togglePip = useCallback(() => {
      const video = videoRef.current;
      if (!video || !pipSupported) {
        return;
      }
      if (document.pictureInPictureElement === video) {
        void document.exitPictureInPicture().catch(noop);
      } else {
        void video.requestPictureInPicture().catch(noop);
      }
    }, [pipSupported]);

    // ---- 静置检测（全屏胶囊的显隐依据） ----
    const [idle, setIdle] = useState(false);
    const idleTimerRef = useRef<number | undefined>(undefined);
    const poke = useCallback(() => {
      setIdle(false);
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => setIdle(true), IDLE_HIDE_MS);
    }, []);
    useEffect(() => () => window.clearTimeout(idleTimerRef.current), []);
    useEffect(() => {
      poke();
    }, [fullscreen, poke]);

    // ---- 键盘反馈 OSD ----
    const [osd, setOsd] = useState<{ text: string; id: number } | null>(null);
    const osdTimerRef = useRef<number | undefined>(undefined);
    const showOsd = useCallback((text: string) => {
      setOsd(prev => ({ text, id: (prev?.id ?? 0) + 1 }));
      window.clearTimeout(osdTimerRef.current);
      osdTimerRef.current = window.setTimeout(() => setOsd(null), OSD_DURATION_MS);
    }, []);
    useEffect(() => () => window.clearTimeout(osdTimerRef.current), []);

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
        void video.play().catch(noop);
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

    const handlePicturePointerDown = useCallback(
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

    // ---- 进度条两段式：拖动预览，松手定档 ----
    const [scrubTime, setScrubTime] = useState<number | null>(null);
    const displayTime = scrubTime ?? currentTime;
    const progress = duration > 0 ? displayTime / duration : 0;
    const buffered = duration > 0 ? bufferedEnd / duration : undefined;

    const showPreview = framePreview && hasPicture && duration > 0;
    const preview = useFramePreview(showPreview ? src : undefined, rest.crossOrigin);

    // ---- 音量 ----
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
    const handleVolumeChange = useCallback(
      (next: number) => {
        setMuted(false);
        setVolume(next);
      },
      [setMuted, setVolume]
    );

    // ---- 键盘快捷键 ----
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const onControl = target !== event.currentTarget;
      if (onControl && isTextInput(target)) {
        return;
      }
      const action = resolveVideoShortcut(event.nativeEvent);
      // 焦点在控件按钮上时，空格交还按钮自身的激活语义
      if (!action || (onControl && target.tagName === "BUTTON" && event.key === " ")) {
        return;
      }
      const video = videoRef.current;
      if (!video) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      poke();

      switch (action.type) {
        case "togglePlay":
          togglePlay();
          break;
        case "seekBy":
          seek(video.currentTime + action.seconds);
          showOsd(`${action.seconds > 0 ? "+" : "−"}${Math.abs(action.seconds)} 秒`);
          break;
        case "volumeBy": {
          const next = clamp01((muted ? 0 : volume) + action.delta);
          setVolume(next);
          if (next === 0) {
            setMuted(true);
          }
          showOsd(next === 0 ? "已静音" : `音量 ${Math.round(next * 100)}%`);
          break;
        }
        case "toggleMute": {
          const willMute = !(muted || volume === 0);
          toggleMute();
          showOsd(
            willMute ? "已静音" : `音量 ${Math.round((volume || lastVolumeRef.current) * 100)}%`
          );
          break;
        }
        case "toggleFullscreen":
          toggleFullscreen();
          break;
        case "togglePip":
          togglePip();
          break;
        case "rateStep": {
          const next = stepPlaybackRate(baseRate, action.step);
          if (next != null) {
            changeRate(next);
            showOsd(`${next}× 速度`);
          }
          break;
        }
        case "frameStep":
          if (video.paused) {
            seek(video.currentTime + action.direction * FRAME_SECONDS);
            showOsd(action.direction > 0 ? "下一帧" : "上一帧");
          }
          break;
        case "seekToFraction":
          if (duration > 0) {
            seek(duration * action.fraction);
            showOsd(`跳到 ${Math.round(action.fraction * 100)}%`);
          }
          break;
      }
    };

    // ---- 控件组装（底栏与全屏胶囊共用，只换色板） ----
    const [rateOpen, setRateOpen] = useState(false);
    const [volumeActive, setVolumeActive] = useState(false);
    const floatVisible = !playing || scrubTime !== null || rateOpen || volumeActive || !idle;

    const renderTooltip = (value: number) => (
      <div className="flex flex-col items-center gap-1">
        {showPreview && (
          <canvas
            ref={preview.canvasRef}
            className="rounded-[6px] bg-black"
            style={{ width: preview.previewWidth, aspectRatio }}
          />
        )}
        <span className="font-tau-mono text-tau-micro px-1 tabular-nums leading-snug">
          {formatTime(value * duration)}
        </span>
      </div>
    );

    const renderProgress = (tone: "surface" | "float", progressClassName: string) => (
      <ProgressBar
        tone={tone}
        square={tone === "surface"}
        className={progressClassName}
        value={progress}
        buffered={buffered}
        onScrub={next => setScrubTime(next * duration)}
        onCommit={next => {
          seek(next * duration);
          setScrubTime(null);
          resume.dismiss();
        }}
        onPointerValue={next => {
          if (showPreview && next != null) {
            preview.request(next * duration);
          }
        }}
        renderTooltip={renderTooltip}
      />
    );

    const renderTrailingControls = (tone: "surface" | "float") => (
      <>
        <VolumeControl
          tone={tone}
          volume={volume}
          muted={muted}
          onVolumeChange={handleVolumeChange}
          onToggleMute={toggleMute}
          onActiveChange={setVolumeActive}
        />
        <RateMenu
          tone={tone}
          rate={baseRate}
          onRateChange={changeRate}
          onOpenChange={setRateOpen}
          className="@max-2xs:hidden"
        />
        {pipSupported && (
          <PipButton tone={tone} active={pip} onToggle={togglePip} className="@max-sm:hidden" />
        )}
        <FullscreenToggle tone={tone} fullscreen={fullscreen} onToggle={toggleFullscreen} />
      </>
    );

    const infoContent =
      resume.resumedAt != null ? (
        <span className="text-accent-text flex min-w-0 items-center gap-1.5">
          <History size={13} className="shrink-0" />
          <span className="truncate">已从上次的 {formatTime(resume.resumedAt)} 继续</span>
          <button
            type="button"
            onClick={resume.restart}
            className="text-ink-2 hover:text-ink-1 shrink-0 underline underline-offset-[3px]"
          >
            从头播放
          </button>
        </span>
      ) : info ? (
        <span className="@max-sm:hidden flex min-w-0 items-center gap-1.5">{info}</span>
      ) : null;

    return (
      <div
        ref={containerRef}
        tabIndex={0}
        className={cn(
          "focus-visible:outline-accent rounded-tau-md bg-surface shadow-card relative select-none overflow-hidden outline-none focus-visible:outline-2 focus-visible:outline-offset-[3px]",
          className,
          fullscreen && "rounded-none bg-black shadow-none",
          fullscreen && playing && !floatVisible && "cursor-none"
        )}
        style={style}
        onKeyDown={handleKeyDown}
        onPointerMove={poke}
      >
        <div className="flex h-full flex-col">
          <div
            className="relative min-h-0 flex-1 bg-black"
            onPointerDown={handlePicturePointerDown}
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
              className="block h-full w-full object-contain"
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
                title="播放 (K)"
                aria-label="播放"
                className="absolute inset-0 grid place-items-center outline-none"
                onClick={togglePlay}
              >
                {waiting ? (
                  <LoaderCircle size={32} className="animate-spin text-white/90" />
                ) : (
                  <span
                    className={cn(
                      "shadow-float grid size-14 place-items-center rounded-full",
                      fullscreen ? "bg-ink-1 text-ink-inverse" : "bg-surface text-accent-text"
                    )}
                  >
                    <Play size={22} className="translate-x-0.5" fill="currentColor" />
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
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  className="bg-ink-1 text-ink-inverse shadow-float text-tau-meta pointer-events-none absolute left-1/2 top-3.5 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 font-semibold"
                >
                  {longPressRate}×
                  <FastForward size={13} fill="currentColor" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* 键盘操作反馈 */}
            <AnimatePresence>
              {osd && (
                <motion.div
                  key={osd.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="bg-ink-1 text-ink-inverse shadow-float text-tau-meta pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full px-3.5 py-1.5 font-semibold tabular-nums"
                >
                  {osd.text}
                </motion.div>
              )}
            </AnimatePresence>

            {/* 全屏：画面内胶囊；收起时只留底边进度细线（压在画面上，固定白色不随主题） */}
            {fullscreen && (
              <>
                <div
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/20 transition-opacity duration-200",
                    floatVisible ? "opacity-0" : "opacity-100"
                  )}
                >
                  <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
                </div>
                <div
                  className={cn(
                    "@container bg-ink-1 rounded-tau-md shadow-float absolute bottom-4 left-1/2 flex h-[42px] w-[min(960px,calc(100%-24px))] -translate-x-1/2 items-center gap-0.5 px-1.5 transition-opacity duration-200",
                    floatVisible ? "opacity-100" : "pointer-events-none opacity-0"
                  )}
                  onPointerDown={event => {
                    // 控件交互不触发长按加速
                    event.stopPropagation();
                  }}
                >
                  <PlayButton tone="float" playing={playing} onToggle={togglePlay} />
                  <TimeCode tone="float" className="ml-1">
                    {formatTime(displayTime)}
                  </TimeCode>
                  {renderProgress("float", "mx-2.5 flex-1")}
                  <TimeCode tone="float" className="@max-sm:hidden mr-1">
                    {formatTime(duration)}
                  </TimeCode>
                  {renderTrailingControls("float")}
                </div>
              </>
            )}
          </div>

          {/* 常态底栏：进度条横贯画面与底栏的接缝 */}
          {!fullscreen && (
            <div className="@container relative flex h-12 shrink-0 items-center gap-0.5 px-2 pt-1">
              {renderProgress("surface", "absolute inset-x-0 -top-1.5")}
              <PlayButton tone="surface" playing={playing} onToggle={togglePlay} />
              <TimeCode tone="surface" className="ml-2">
                <span className="text-ink-1 font-medium">{formatTime(displayTime)}</span>
                {" / "}
                {formatTime(duration)}
              </TimeCode>
              <div className="text-ink-3 text-tau-sm ml-3.5 flex min-w-0 flex-1 items-center">
                {infoContent}
              </div>
              {renderTrailingControls("surface")}
            </div>
          )}
        </div>
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
