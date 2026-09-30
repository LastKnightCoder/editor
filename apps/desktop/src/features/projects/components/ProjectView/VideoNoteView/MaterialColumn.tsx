/**
 * 视频笔记 · 左栏「材料」：视频 + 跟随播放的转录（点句跳播）。
 * 未转录时转录区即空状态入口（自动识别语言；指定语言走条目 ⋯ 菜单）；
 * 转录 / AI 断句进行中就地显示进度与流式结果。
 */

import { useCallback, useRef } from "react";
import { Captions } from "lucide-react";
import { Button, Spinner } from "@tau/ui";
import { VideoPlayer } from "@tau/shared";
import LocalVideo from "@/components/LocalVideo";
import { FadeScroll } from "@/components/FadeScroll";
import TranscriptPanel from "@/components/MediaTranscript/TranscriptPanel";
import { formatTime, useTranscriptSync } from "@/components/MediaTranscript/useTranscriptSync";
import type { useVideoNoteSource } from "@/components/VideoNotePanel/useVideoNoteSource";
import type { useVideoNoteTranscription } from "@/components/VideoNotePanel/useVideoNoteTranscription";
import type { VideoNote } from "@/types";

interface MaterialColumnProps {
  videoNote: VideoNote;
  source: ReturnType<typeof useVideoNoteSource>;
  transcription: ReturnType<typeof useVideoNoteTranscription>;
  subtitleTrackUrl: string;
  subtitleLanguage: string;
  /** 视频元素挂载 / 卸载（笔记的时间戳、截帧扩展经它控制播放） */
  onVideoElement: (element: HTMLVideoElement | null) => void;
}

export function MaterialColumn({
  videoNote,
  source,
  transcription,
  subtitleTrackUrl,
  subtitleLanguage,
  onVideoElement,
}: MaterialColumnProps) {
  const segments = videoNote.transcriptSegments;
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const {
    currentSegmentIndex,
    transcriptContainerRef,
    segmentRefsMap,
    handleSegmentClick,
    setMediaRef,
  } = useTranscriptSync({ segments, mediaRef });

  const setVideoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      setMediaRef(element);
      onVideoElement(element);
    },
    [setMediaRef, onVideoElement]
  );

  const track = subtitleTrackUrl ? (
    <track
      key={subtitleTrackUrl}
      kind="subtitles"
      src={subtitleTrackUrl}
      srcLang={subtitleLanguage}
      label="转录字幕"
      default
    />
  ) : null;

  const { isTranscribing, progress, isOptimizing, streamingSegments } = transcription;
  const hasSegments = !!segments?.length;

  return (
    // pb-4：转录视口与纸面下缘留出间距（同文档 / 网页条目正文），列表在视口边缘渐隐而非贴边硬切
    <div className="flex h-full min-h-0 flex-col pb-4">
      {/* 视频：就绪前用主题化底色的 16:9 框承载下载 / 错误态，就绪后换成播放器卡片 */}
      <div className="shrink-0 px-3 pb-3">
        {source.ready ? (
          source.useLocalVideo ? (
            <LocalVideo
              ref={setVideoRef}
              src={source.src!}
              crossOrigin="anonymous"
              className="w-full"
            >
              {track}
            </LocalVideo>
          ) : (
            <VideoPlayer
              ref={setVideoRef}
              src={source.src!}
              crossOrigin="anonymous"
              className="w-full"
            >
              {track}
            </VideoPlayer>
          )
        ) : (
          <div className="rounded-tau-md bg-sunken relative aspect-video w-full overflow-hidden">
            {source.loader}
          </div>
        )}
      </div>

      <div className="text-tau-sm text-ink-3 flex h-7 shrink-0 items-center gap-2 px-5">
        <span>转录</span>
        {hasSegments && !isTranscribing && <span>· {segments!.length} 段</span>}
        {isTranscribing && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Spinner className="size-3" />
            <span className="truncate">{progress}</span>
          </span>
        )}
        <span className="flex-1" />
        {isOptimizing && (
          <button
            type="button"
            onClick={transcription.cancelOptimization}
            className="text-ink-2 hover:text-ink-1 cursor-pointer"
          >
            取消优化
          </button>
        )}
      </div>

      {isOptimizing && streamingSegments.length > 0 ? (
        <FadeScroll className="tau-sheet-scroll min-h-0 flex-1 [--edge-fade-bottom-size:24px] [--edge-fade-top-size:24px]">
          <div className="flex flex-col gap-px px-2 pb-6 pt-1">
            {streamingSegments.map((segment, index) => (
              <div
                key={index}
                className="grid grid-cols-[48px_1fr] gap-2 rounded-[8px] px-3 py-1.5"
              >
                <span className="text-tau-sm text-ink-3 pt-px font-mono tabular-nums">
                  {formatTime(segment.start)}
                </span>
                <span className="text-tau-body text-ink-2 break-words leading-relaxed">
                  {segment.text}
                </span>
              </div>
            ))}
          </div>
        </FadeScroll>
      ) : hasSegments ? (
        <TranscriptPanel
          segments={segments}
          currentSegmentIndex={currentSegmentIndex}
          containerRef={transcriptContainerRef}
          segmentRefsMap={segmentRefsMap}
          onSegmentClick={handleSegmentClick}
          innerClassName="px-2 pb-6 pt-1"
          className="tau-sheet-scroll [--edge-fade-bottom-size:24px] [--edge-fade-top-size:24px]"
        />
      ) : isTranscribing ? (
        <div className="text-tau-meta text-ink-3 flex flex-1 items-center justify-center px-6 text-center">
          转录完成后，字幕会出现在这里
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-10 text-center">
          <Captions className="text-ink-3 size-6" strokeWidth={1.5} />
          <p className="text-tau-meta text-ink-2">
            还没有转录。转录后可以跟随字幕阅读，
            <br />
            也能让 AI 基于视频内容回答
          </p>
          <Button size="sm" variant="primary" onClick={() => void transcription.transcribe()}>
            开始转录
          </Button>
          <p className="text-tau-sm text-ink-3">自动识别语言，需要指定语言可在右上角 ⋯ 中选择</p>
        </div>
      )}
    </div>
  );
}
