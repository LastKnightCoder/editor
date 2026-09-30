import { useCallback, useEffect, useRef, useState } from "react";
import { resolveMediaShortcut, stepPlaybackRate } from "./mediaShortcuts";

const OSD_DURATION_MS = 700;
const FRAME_SECONDS = 1 / 30;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const isTextInput = (element: HTMLElement) =>
  element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName);

/** 键盘操作反馈（OSD）：显示一段短文案，0.7 秒后自动收起 */
export function useOsd() {
  const [osd, setOsd] = useState<{ text: string; id: number } | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const showOsd = useCallback((text: string) => {
    setOsd(prev => ({ text, id: (prev?.id ?? 0) + 1 }));
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOsd(null), OSD_DURATION_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  return { osd, showOsd };
}

/** 静音切换：取消静音时恢复到静音前的音量 */
export function useToggleMute(
  volume: number,
  muted: boolean,
  setVolume: (volume: number) => void,
  setMuted: (muted: boolean) => void
) {
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
  return { toggleMute, lastVolumeRef };
}

interface MediaKeyDownOptions {
  mediaRef: React.RefObject<HTMLMediaElement | null>;
  duration: number;
  volume: number;
  muted: boolean;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  toggleMute: () => void;
  lastVolumeRef: React.RefObject<number>;
  rate: number;
  changeRate: (rate: number) => void;
  showOsd: (text: string) => void;
  /** 每次按键生效后回调（如全屏胶囊的静置计时重置） */
  onActivity?: () => void;
  /** 以下能力只有视频提供；未提供时对应按键放行 */
  toggleFullscreen?: () => void;
  togglePip?: () => void;
  frameStep?: boolean;
}

/**
 * 播放器根节点的 keydown 处理：按 mediaShortcuts 解析动作并执行，结果经 OSD 反馈。
 * 焦点在文本输入（如音频标题）里时不拦截；焦点在控件按钮上时空格交还按钮自身。
 */
export function useMediaKeyDown(options: MediaKeyDownOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  return useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const onControl = target !== event.currentTarget;
    if (onControl && isTextInput(target)) {
      return;
    }
    const action = resolveMediaShortcut(event.nativeEvent);
    if (!action || (onControl && target.tagName === "BUTTON" && event.key === " ")) {
      return;
    }
    const o = optionsRef.current;
    const media = o.mediaRef.current;
    if (!media) {
      return;
    }
    const unsupported =
      (action.type === "toggleFullscreen" && !o.toggleFullscreen) ||
      (action.type === "togglePip" && !o.togglePip) ||
      (action.type === "frameStep" && !o.frameStep);
    if (unsupported) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    o.onActivity?.();

    switch (action.type) {
      case "togglePlay":
        o.togglePlay();
        break;
      case "seekBy":
        o.seek(media.currentTime + action.seconds);
        o.showOsd(`${action.seconds > 0 ? "+" : "−"}${Math.abs(action.seconds)} 秒`);
        break;
      case "volumeBy": {
        const next = clamp01((o.muted ? 0 : o.volume) + action.delta);
        o.setVolume(next);
        if (next === 0) {
          o.setMuted(true);
        }
        o.showOsd(next === 0 ? "已静音" : `音量 ${Math.round(next * 100)}%`);
        break;
      }
      case "toggleMute": {
        const willMute = !(o.muted || o.volume === 0);
        o.toggleMute();
        o.showOsd(
          willMute ? "已静音" : `音量 ${Math.round((o.volume || o.lastVolumeRef.current) * 100)}%`
        );
        break;
      }
      case "toggleFullscreen":
        o.toggleFullscreen?.();
        break;
      case "togglePip":
        o.togglePip?.();
        break;
      case "rateStep": {
        const next = stepPlaybackRate(o.rate, action.step);
        if (next != null) {
          o.changeRate(next);
          o.showOsd(`${next}× 速度`);
        }
        break;
      }
      case "frameStep":
        if (media.paused) {
          o.seek(media.currentTime + action.direction * FRAME_SECONDS);
          o.showOsd(action.direction > 0 ? "下一帧" : "上一帧");
        }
        break;
      case "seekToFraction":
        if (o.duration > 0) {
          o.seek(o.duration * action.fraction);
          o.showOsd(`跳到 ${Math.round(action.fraction * 100)}%`);
        }
        break;
    }
  }, []);
}
