import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, cn } from "@tau/ui";
import { ChevronDown, CircleAlert } from "lucide-react";
import ProgressBar from "./ProgressBar";
import Waveform from "./Waveform";
import type { WaveformSegment } from "./waveformSegments";
import { formatTime } from "./formatTime";
import { useMediaController } from "./useMediaController";
import { useAudioPeaks } from "./useAudioPeaks";
import { AUDIO_POSITION_PREFIX, usePlaybackResume } from "./usePlaybackResume";
import { useMediaKeyDown, useOsd, useToggleMute } from "./useMediaKeyboard";
import {
  MediaOsd,
  PlayButton,
  RateMenu,
  ResumeNotice,
  TimeCode,
  VolumeControl,
} from "./MediaControls";

export interface AudioPlayerFooterContext {
  currentTime: number;
  playing: boolean;
  /** 跳到指定秒数并开始播放 */
  playFrom: (time: number) => void;
}

export interface AudioPlayerProps extends React.AudioHTMLAttributes<HTMLAudioElement> {
  /** 卡片标题，默认从 src 提取文件名 */
  label?: string;
  /** 标题位替换渲染（编辑器就地编辑标题时传输入框） */
  labelSlot?: React.ReactNode;
  /** 标题下的信息位（来源等），时长自动接在后面 */
  info?: React.ReactNode;
  /** 生成该音频的原文（如文本转语音）；提供时显示「文本生成」标记，可在卡片内展开原文 */
  sourceText?: string;
  /** 播放位置持久化键，传入即启用续播（1 分钟以上的音频）；同时作为波形缓存键 */
  persistKey?: string;
  /** 波形取数：宿主能直接读文件时注入（绕开不支持 fetch 的媒体协议），默认 fetch 播放地址 */
  loadWaveformData?: () => Promise<ArrayBuffer>;
  /** 基础播放速率 */
  playbackRate?: number;
  /** 用户经菜单或快捷键改了倍速时回调 */
  onPlaybackRateChange?: (rate: number) => void;
  /** 已知时长（秒）：元数据就绪前先显示，避免流式加载时一直是 --:-- */
  durationHint?: number;
  /** 波形分段着色（秒为单位），如播客按说话人 */
  segments?: { start: number; end: number; tone: WaveformSegment["tone"] }[];
  /** 标题行末尾的附加操作（如 ⋯ 菜单） */
  actions?: React.ReactNode;
  /** 波形行下方的附加内容，拿到播放进度（如逐句脚本） */
  footer?: (context: AudioPlayerFooterContext) => React.ReactNode;
}

/** 1 分钟以内的短音频不记忆播放位置 */
const RESUME_MIN_DURATION = 60;

const ERROR_MESSAGES: Record<number, string> = {
  2: "网络错误，音频没能加载",
  3: "文件已损坏或格式不支持",
  4: "文件不存在或格式不支持",
};

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

/**
 * 音频播放器（波形卡）：标题行 + 波形进度行。30 分钟以内且取得到数据的音频画真实波形，
 * 否则退回进度线。src 为空视为加载中（保留卡片占位），播放失败在卡片内说明原因并可重试。
 * 聚焦后快捷键与视频一致（不含全屏 / 画中画 / 逐帧）。
 */
const AudioPlayer = forwardRef<HTMLAudioElement, AudioPlayerProps>(
  (
    {
      src,
      label,
      labelSlot,
      info,
      sourceText,
      persistKey,
      loadWaveformData,
      playbackRate,
      onPlaybackRateChange,
      durationHint,
      segments,
      actions,
      footer,
      className,
      style,
      // 自定义控件始终接管，忽略原生 controls
      controls: _controls,
      onError,
      onLoadedMetadata,
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

    const resume = usePlaybackResume(audioRef, persistKey, {
      prefix: AUDIO_POSITION_PREFIX,
      minDuration: RESUME_MIN_DURATION,
    });
    const peaks = useAudioPeaks({
      src,
      duration,
      cacheKey: persistKey ?? src,
      loadData: loadWaveformData,
    });

    // ---- 倍速（换源后 playbackRate 会被重置，元数据就绪时恢复） ----
    const [rate, setRate] = useState(playbackRate ?? 1);
    const rateRef = useRef(rate);
    useEffect(() => {
      rateRef.current = rate;
      if (audioRef.current) {
        audioRef.current.playbackRate = rate;
      }
    }, [rate]);
    useEffect(() => {
      if (playbackRate != null && playbackRate > 0) {
        setRate(playbackRate);
      }
    }, [playbackRate]);
    const changeRate = useCallback(
      (next: number) => {
        setRate(next);
        onPlaybackRateChange?.(next);
      },
      [onPlaybackRateChange]
    );

    // ---- 加载失败 ----
    const [errorCode, setErrorCode] = useState<number | null>(null);
    useEffect(() => {
      setErrorCode(null);
    }, [src]);
    const retry = useCallback(() => {
      setErrorCode(null);
      audioRef.current?.load();
    }, []);

    const handleLoadedMetadata = useCallback(
      (event: React.SyntheticEvent<HTMLAudioElement, Event>) => {
        event.currentTarget.playbackRate = rateRef.current;
        setErrorCode(null);
        onLoadedMetadata?.(event);
      },
      [onLoadedMetadata]
    );

    // ---- 进度条两段式：拖动预览，松手定档 ----
    const [scrubTime, setScrubTime] = useState<number | null>(null);
    const displayTime = scrubTime ?? currentTime;
    const progress = duration > 0 ? displayTime / duration : 0;
    const scrubProps = {
      value: progress,
      onScrub: (next: number) => setScrubTime(next * duration),
      onCommit: (next: number) => {
        seek(next * duration);
        setScrubTime(null);
        resume.dismiss();
      },
      renderTooltip: (next: number) => (
        <span className="font-tau-mono text-tau-micro px-1 tabular-nums leading-snug">
          {formatTime(next * duration)}
        </span>
      ),
    };

    const { toggleMute, lastVolumeRef } = useToggleMute(volume, muted, setVolume, setMuted);
    const { osd, showOsd } = useOsd();
    const handleKeyDown = useMediaKeyDown({
      mediaRef: audioRef,
      duration,
      volume,
      muted,
      setVolume,
      setMuted,
      togglePlay,
      seek,
      toggleMute,
      lastVolumeRef,
      rate,
      changeRate,
      showOsd,
    });

    const [sourceOpen, setSourceOpen] = useState(false);

    const loading = !src;
    const failed = errorCode != null;
    const title = label || deriveLabel(src ?? "");
    const knownDuration = duration > 0 ? duration : (durationHint ?? 0);
    const durationText = knownDuration > 0 ? formatTime(knownDuration) : "--:--";
    const waveformSegments = useMemo(
      () =>
        duration > 0 && segments?.length
          ? segments.map(segment => ({
              start: segment.start / duration,
              end: segment.end / duration,
              tone: segment.tone,
            }))
          : undefined,
      [duration, segments]
    );
    const dismissResume = resume.dismiss;
    const playFrom = useCallback(
      (time: number) => {
        seek(time);
        dismissResume();
        void audioRef.current?.play().catch(() => undefined);
      },
      [seek, dismissResume]
    );

    const metaLine = failed ? (
      <span className="text-danger truncate">
        无法播放：{ERROR_MESSAGES[errorCode] ?? "音频无法播放"}
      </span>
    ) : resume.resumedAt != null ? (
      <ResumeNotice label={formatTime(resume.resumedAt)} onRestart={resume.restart} />
    ) : (
      <span className="flex min-w-0 items-center gap-1 truncate">
        {info && <span className="truncate">{info}</span>}
        {info && knownDuration > 0 && <span aria-hidden>·</span>}
        {knownDuration > 0 && <span className="shrink-0 tabular-nums">{durationText}</span>}
      </span>
    );

    return (
      <div
        tabIndex={0}
        className={cn(
          "rounded-tau-md bg-surface shadow-card focus-visible:outline-accent relative select-none px-4 pb-3 pt-3.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-[3px]",
          className
        )}
        style={style}
        onKeyDown={handleKeyDown}
      >
        {/* 标题行：播放钮 / 标题与信息 / 音量与倍速 */}
        <div className="@container flex items-center gap-0.5">
          {loading ? (
            <span className="bg-accent-soft grid size-[42px] shrink-0 place-items-center rounded-full">
              <span className="border-accent/25 border-t-accent size-3.5 animate-spin rounded-full border-2" />
            </span>
          ) : failed ? (
            <span className="bg-danger-soft text-danger grid size-[42px] shrink-0 place-items-center rounded-full">
              <CircleAlert size={17} />
            </span>
          ) : (
            <PlayButton tone="surface" size="lg" playing={playing} onToggle={togglePlay} />
          )}

          <div className="mx-3 min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                {labelSlot ?? (
                  <div className="text-tau-body text-ink-1 truncate font-medium">{title}</div>
                )}
              </div>
              {sourceText && (
                <>
                  <span className="border-line-1 text-ink-2 shrink-0 rounded-[6px] border px-1.5 text-[11px] leading-[18px]">
                    文本生成
                  </span>
                  <button
                    type="button"
                    aria-expanded={sourceOpen}
                    onClick={() => setSourceOpen(open => !open)}
                    className="text-ink-2 hover:bg-hover hover:text-ink-1 text-tau-sm flex shrink-0 items-center gap-0.5 rounded-[6px] px-1"
                  >
                    原文
                    <ChevronDown
                      size={13}
                      className={cn("transition-transform", sourceOpen && "rotate-180")}
                    />
                  </button>
                </>
              )}
            </div>
            <div className="text-ink-3 text-tau-sm mt-0.5 flex min-w-0 items-center">
              {metaLine}
            </div>
          </div>

          {failed ? (
            <Button size="sm" variant="primary" onClick={retry}>
              重试
            </Button>
          ) : (
            <>
              <VolumeControl
                tone="surface"
                volume={volume}
                muted={muted}
                onVolumeChange={next => {
                  setMuted(false);
                  setVolume(next);
                }}
                onToggleMute={toggleMute}
              />
              <RateMenu
                tone="surface"
                rate={rate}
                onRateChange={changeRate}
                className="@max-sm:hidden"
              />
            </>
          )}
          {actions}
        </div>

        {/* 波形行：30 分钟以内画真实波形，否则（或数据未就绪）退回进度线，行高固定不跳 */}
        {!failed && (
          <div className="mt-2.5 flex h-10 items-center gap-3 pr-1">
            <TimeCode tone="surface">
              <span className="text-ink-1 font-medium">
                {loading ? "--:--" : formatTime(displayTime)}
              </span>
            </TimeCode>
            {peaks ? (
              <Waveform
                peaks={peaks}
                segments={waveformSegments}
                className="flex-1"
                {...scrubProps}
              />
            ) : (
              <ProgressBar
                tone="surface"
                className="flex-1"
                buffered={duration > 0 && bufferedEnd > 0 ? bufferedEnd / duration : undefined}
                {...scrubProps}
              />
            )}
            <TimeCode tone="surface">{durationText}</TimeCode>
          </div>
        )}

        {sourceText && sourceOpen && (
          <div className="bg-hover rounded-tau-sm text-ink-2 text-tau-body mt-1.5 select-text whitespace-pre-wrap px-3 py-2.5 leading-relaxed">
            {sourceText}
          </div>
        )}

        {!failed && footer?.({ currentTime, playing, playFrom })}

        <MediaOsd osd={osd} />

        <audio
          ref={setAudioRefs}
          src={src || undefined}
          preload="metadata"
          hidden
          onLoadedMetadata={handleLoadedMetadata}
          onError={event => {
            setErrorCode(event.currentTarget.error?.code ?? 0);
            onError?.(event);
          }}
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
