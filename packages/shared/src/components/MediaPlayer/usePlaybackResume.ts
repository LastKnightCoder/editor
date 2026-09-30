import { useCallback, useEffect, useRef, useState } from "react";

/** 与历史 LocalVideo 的存储键保持一致，升级后已有的播放位置继续可用 */
export const VIDEO_POSITION_PREFIX = "video_position_";

/** 距开头 / 结尾不足该秒数的位置不续播（刚开始看或已看完） */
const RESUME_EDGE_SECONDS = 5;
const SAVE_INTERVAL_MS = 1000;
const NOTICE_DURATION_MS = 8000;

/** 解析已保存的播放位置，不值得续播时返回 null */
export function resolveResumePosition(saved: string | null, duration: number): number | null {
  if (saved == null || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  const position = Number.parseFloat(saved);
  if (
    !Number.isFinite(position) ||
    position < RESUME_EDGE_SECONDS ||
    position > duration - RESUME_EDGE_SECONDS
  ) {
    return null;
  }
  return position;
}

/**
 * 播放位置持久化：按 persistKey 存进 localStorage，打开时跳回上次位置，
 * 并给出 resumedAt 供界面提示「已从上次的 xx 继续 · 从头播放」（8 秒后自动收起）。
 * 不传 persistKey 则不启用。
 */
export function usePlaybackResume(
  mediaRef: React.RefObject<HTMLMediaElement | null>,
  persistKey: string | undefined
) {
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const noticeTimerRef = useRef<number | undefined>(undefined);

  const dismiss = useCallback(() => {
    window.clearTimeout(noticeTimerRef.current);
    setResumedAt(null);
  }, []);

  useEffect(() => {
    const media = mediaRef.current;
    setResumedAt(null);
    if (!media || !persistKey) {
      return;
    }
    const storageKey = `${VIDEO_POSITION_PREFIX}${persistKey}`;
    let lastSavedAt = 0;

    const handleLoadedMetadata = () => {
      // 宿主已自行恢复过进度（如换源回退）时不再覆盖
      if (media.currentTime > 0.5) {
        return;
      }
      const position = resolveResumePosition(localStorage.getItem(storageKey), media.duration);
      if (position == null) {
        return;
      }
      media.currentTime = position;
      setResumedAt(position);
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => setResumedAt(null), NOTICE_DURATION_MS);
    };
    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastSavedAt < SAVE_INTERVAL_MS) {
        return;
      }
      lastSavedAt = now;
      localStorage.setItem(storageKey, String(media.currentTime));
    };
    const handleEnded = () => {
      localStorage.removeItem(storageKey);
    };

    if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
      handleLoadedMetadata();
    }
    media.addEventListener("loadedmetadata", handleLoadedMetadata);
    media.addEventListener("timeupdate", handleTimeUpdate);
    media.addEventListener("ended", handleEnded);
    return () => {
      window.clearTimeout(noticeTimerRef.current);
      media.removeEventListener("loadedmetadata", handleLoadedMetadata);
      media.removeEventListener("timeupdate", handleTimeUpdate);
      media.removeEventListener("ended", handleEnded);
    };
  }, [mediaRef, persistKey]);

  const restart = useCallback(() => {
    const media = mediaRef.current;
    if (media) {
      media.currentTime = 0;
    }
    dismiss();
  }, [dismiss, mediaRef]);

  return { resumedAt, restart, dismiss };
}
