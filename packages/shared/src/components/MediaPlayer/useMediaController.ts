import { useCallback, useEffect, useState } from "react";

export interface MediaController {
  playing: boolean;
  currentTime: number;
  duration: number;
  /** 已缓冲到的位置（秒） */
  bufferedEnd: number;
  volume: number;
  muted: boolean;
  /** 缓冲加载中 */
  waiting: boolean;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

/**
 * video / audio 元素共用的播放状态控制器，
 * 通过媒体元素事件同步状态，动作直接写回元素
 */
export const useMediaController = (
  mediaRef: React.RefObject<HTMLMediaElement | null>
): MediaController => {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    const syncBuffered = () => {
      if (media.buffered.length > 0) {
        setBufferedEnd(media.buffered.end(media.buffered.length - 1));
      }
    };

    // 挂载时元素可能已完成部分加载，先同步一遍现有状态
    setCurrentTime(media.currentTime);
    setDuration(media.duration || 0);
    setVolumeState(media.volume);
    setMutedState(media.muted);
    syncBuffered();

    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(media.currentTime);
    const handleDurationChange = () => setDuration(media.duration || 0);
    const handleLoadedMetadata = () => {
      setDuration(media.duration || 0);
      syncBuffered();
    };
    const handleProgress = syncBuffered;
    const handleVolumeChange = () => {
      setVolumeState(media.volume);
      setMutedState(media.muted);
    };
    const handleWaiting = () => setWaiting(true);
    const handleCanPlay = () => setWaiting(false);

    media.addEventListener("play", handlePlay);
    media.addEventListener("pause", handlePause);
    media.addEventListener("ended", handleEnded);
    media.addEventListener("timeupdate", handleTimeUpdate);
    media.addEventListener("durationchange", handleDurationChange);
    media.addEventListener("loadedmetadata", handleLoadedMetadata);
    media.addEventListener("progress", handleProgress);
    media.addEventListener("volumechange", handleVolumeChange);
    media.addEventListener("waiting", handleWaiting);
    media.addEventListener("canplay", handleCanPlay);
    media.addEventListener("playing", handleCanPlay);

    return () => {
      media.removeEventListener("play", handlePlay);
      media.removeEventListener("pause", handlePause);
      media.removeEventListener("ended", handleEnded);
      media.removeEventListener("timeupdate", handleTimeUpdate);
      media.removeEventListener("durationchange", handleDurationChange);
      media.removeEventListener("loadedmetadata", handleLoadedMetadata);
      media.removeEventListener("progress", handleProgress);
      media.removeEventListener("volumechange", handleVolumeChange);
      media.removeEventListener("waiting", handleWaiting);
      media.removeEventListener("canplay", handleCanPlay);
      media.removeEventListener("playing", handleCanPlay);
    };
  }, [mediaRef]);

  const togglePlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media) {
      return;
    }
    if (media.paused) {
      void media.play().catch(() => undefined);
    } else {
      media.pause();
    }
  }, [mediaRef]);

  const seek = useCallback(
    (time: number) => {
      const media = mediaRef.current;
      if (!media) {
        return;
      }
      const max = Number.isFinite(media.duration) ? media.duration : Number.POSITIVE_INFINITY;
      const clamped = Math.min(Math.max(time, 0), max);
      media.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [mediaRef]
  );

  // 音量/静音动作在写媒体元素的同时同步更新状态，
  // 避免松手瞬间回读事件未到导致滑杆视觉回弹
  const setVolume = useCallback(
    (next: number) => {
      const media = mediaRef.current;
      const clamped = Math.min(Math.max(next, 0), 1);
      if (media) {
        media.volume = clamped;
        if (clamped > 0 && media.muted) {
          media.muted = false;
        }
      }
      setVolumeState(clamped);
      if (clamped > 0) {
        setMutedState(false);
      }
    },
    [mediaRef]
  );

  const setMuted = useCallback(
    (next: boolean) => {
      const media = mediaRef.current;
      if (media) {
        media.muted = next;
      }
      setMutedState(next);
    },
    [mediaRef]
  );

  return {
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
  };
};
