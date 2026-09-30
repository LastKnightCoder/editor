import { PLAYBACK_RATES } from "./MediaControls";

/** 播放器快捷键解析出的动作；执行与 OSD 反馈由播放器负责 */
export type MediaShortcutAction =
  | { type: "togglePlay" }
  | { type: "seekBy"; seconds: number }
  | { type: "volumeBy"; delta: number }
  | { type: "toggleMute" }
  | { type: "toggleFullscreen" }
  | { type: "togglePip" }
  | { type: "rateStep"; step: 1 | -1 }
  | { type: "frameStep"; direction: 1 | -1 }
  | { type: "seekToFraction"; fraction: number };

type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "isComposing"
>;

/**
 * 按键 → 动作。带 ⌘/Ctrl/Alt 的组合键一律放行给应用级快捷键（如 Alt+←/→ 后退前进），
 * 输入法组合中的按键也不拦截。
 */
export function resolveMediaShortcut(event: ShortcutKeyEvent): MediaShortcutAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
    return null;
  }
  const { key } = event;
  switch (key) {
    case " ":
    case "k":
    case "K":
      return { type: "togglePlay" };
    case "ArrowLeft":
      return { type: "seekBy", seconds: -5 };
    case "ArrowRight":
      return { type: "seekBy", seconds: 5 };
    case "j":
    case "J":
      return { type: "seekBy", seconds: -10 };
    case "l":
    case "L":
      return { type: "seekBy", seconds: 10 };
    case "ArrowUp":
      return { type: "volumeBy", delta: 0.1 };
    case "ArrowDown":
      return { type: "volumeBy", delta: -0.1 };
    case "m":
    case "M":
      return { type: "toggleMute" };
    case "f":
    case "F":
      return { type: "toggleFullscreen" };
    case "p":
    case "P":
      return { type: "togglePip" };
    case ">":
      return { type: "rateStep", step: 1 };
    case "<":
      return { type: "rateStep", step: -1 };
    case ".":
      return { type: "frameStep", direction: 1 };
    case ",":
      return { type: "frameStep", direction: -1 };
    default:
      if (/^[0-9]$/.test(key)) {
        return { type: "seekToFraction", fraction: Number(key) / 10 };
      }
      return null;
  }
}

/** 倍速档位步进，越界返回 null */
export function stepPlaybackRate(rate: number, step: 1 | -1): number | null {
  const index = PLAYBACK_RATES.indexOf(rate);
  // 非档位速率（如节点里存了 1.1）按最近的档位起步
  const base =
    index >= 0
      ? index
      : PLAYBACK_RATES.reduce(
          (best, option, i) =>
            Math.abs(option - rate) < Math.abs(PLAYBACK_RATES[best] - rate) ? i : best,
          0
        );
  return PLAYBACK_RATES[base + step] ?? null;
}
