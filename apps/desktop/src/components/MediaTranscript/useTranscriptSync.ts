import { useState, useRef, useCallback, useEffect } from "react";
import { useThrottleFn } from "ahooks";

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

interface UseTranscriptSyncOptions {
  segments: TranscriptSegment[] | null | undefined;
  mediaRef: React.MutableRefObject<HTMLVideoElement | HTMLAudioElement | null>;
}

export const formatTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

export function useTranscriptSync({ segments, mediaRef }: UseTranscriptSyncOptions) {
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const segmentRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());

  const findCurrentSegmentIndex = useCallback(
    (currentTimeMs: number, segs: TranscriptSegment[]): number | null => {
      if (segs.length === 0) return null;
      if (currentTimeMs < segs[0].start) return null;
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        const next = segs[i + 1];
        if (currentTimeMs >= seg.start && currentTimeMs < seg.end) return i;
        if (next && currentTimeMs >= seg.end && currentTimeMs < next.start) return i;
      }
      if (currentTimeMs >= segs[segs.length - 1].end) return segs.length - 1;
      return null;
    },
    []
  );

  const checkShouldAutoScroll = useCallback((prevIndex: number | null): boolean => {
    if (prevIndex === null) return false;
    const container = transcriptContainerRef.current;
    const prevElement = segmentRefsMap.current.get(prevIndex);
    if (!container || !prevElement) return false;
    const containerRect = container.getBoundingClientRect();
    const elementRect = prevElement.getBoundingClientRect();
    return elementRect.top >= containerRect.top && elementRect.bottom <= containerRect.bottom;
  }, []);

  const scrollToSegment = useCallback((index: number) => {
    const element = segmentRefsMap.current.get(index);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const handleSegmentClick = useCallback(
    (segment: TranscriptSegment) => {
      const media = mediaRef.current;
      if (media) {
        media.currentTime = segment.start / 1000;
        media.play();
      }
    },
    [mediaRef]
  );

  const { run: handleTimeUpdate } = useThrottleFn(
    () => {
      const media = mediaRef.current;
      if (!media || !segments?.length || media.paused) return;
      const currentTimeMs = media.currentTime * 1000;
      const newIndex = findCurrentSegmentIndex(currentTimeMs, segments);
      if (newIndex !== null && newIndex !== currentSegmentIndex) {
        const shouldScroll = checkShouldAutoScroll(currentSegmentIndex);
        setCurrentSegmentIndex(newIndex);
        if (shouldScroll) scrollToSegment(newIndex);
      }
    },
    { wait: 100 }
  );

  const timeUpdateHandlerRef = useRef<(() => void) | null>(null);

  // Keep handler ref up to date
  useEffect(() => {
    timeUpdateHandlerRef.current = handleTimeUpdate;
  }, [handleTimeUpdate]);

  // 监听器用稳定包装转调最新 handler：元素先于 effect 挂上时也不会漏绑
  const onTimeUpdate = useCallback(() => timeUpdateHandlerRef.current?.(), []);

  // Callback ref: bind/unbind timeupdate listener when DOM element mounts/unmounts
  const setMediaRef = useCallback(
    (element: HTMLVideoElement | HTMLAudioElement | null) => {
      mediaRef.current?.removeEventListener("timeupdate", onTimeUpdate);
      mediaRef.current = element;
      element?.addEventListener("timeupdate", onTimeUpdate);
    },
    [mediaRef, onTimeUpdate]
  );

  return {
    currentSegmentIndex,
    transcriptContainerRef,
    segmentRefsMap,
    handleSegmentClick,
    setMediaRef,
  };
}
