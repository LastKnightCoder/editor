import { useCurrentFrame } from "remotion";
import { ease, mix, progress } from "../brand/motion";

/** 光标路径点：at 帧时到达 (x, y)；click 为真则在抵达时点按 */
export type CursorStop = { at: number; x: number; y: number; click?: boolean };

/**
 * 一次点按的两个路径点：提前 lead 帧移到 to 停住，到 at 帧按下。
 * 场景里写成 `...clickAt(TARGET.x, at(拍), lead * beatFrames(拍))`。
 */
export function clickAt(to: { x: number; y: number }, at: number, lead: number): CursorStop[] {
  return [
    { at: at - lead, ...to },
    { at, ...to, click: true },
  ];
}

/** 一次移动最长用时（帧）：两个路径点相隔更久时，先停在原处，到点前这么久才动身，不在中间慢慢漂 */
const MAX_MOVE = 26;
/** 停住超过这么久（帧）就淡出，动身前再淡入，免得静止的光标在别的演示里抢戏 */
const IDLE_HIDE = 150;
const IDLE_FADE = 14;

/** macOS 风格箭头光标，沿路径点缓动移动，点按时缩放并荡开一圈涟漪（坐标为父容器坐标） */
export function Cursor({ path, visibleFrom = 0, visibleTo = 1e9 }: { path: CursorStop[]; visibleFrom?: number; visibleTo?: number }) {
  const frame = useCurrentFrame();
  if (frame < visibleFrom - 12 || frame > visibleTo + 12) return null;
  let x = path[0].x;
  let y = path[0].y;
  let idle = 1;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    if (frame <= from.at) break;
    const moving = from.x !== to.x || from.y !== to.y;
    const span = to.at - from.at;
    const start = moving ? Math.max(from.at, to.at - MAX_MOVE) : from.at;
    const t = progress(frame, start, Math.max(1, to.at - start), ease.inOut);
    x = mix(from.x, to.x, t);
    y = mix(from.y, to.y, t);
    if (frame < to.at && span > IDLE_HIDE) {
      // 长时间停住：点完后淡出，动身前淡入
      const rest = moving ? start : to.at;
      idle = Math.max(1 - progress(frame, from.at + 24, IDLE_FADE), progress(frame, rest - IDLE_FADE - 6, IDLE_FADE));
    }
  }
  const click = path.find(p => p.click && frame >= p.at && frame < p.at + 24);
  const press = click ? Math.sin(Math.min(1, (frame - click.at) / 10) * Math.PI) : 0;
  const ripple = click ? progress(frame, click.at, 24) : 0;
  const opacity = Math.min(progress(frame, visibleFrom - 12, 12), 1 - progress(frame, visibleTo, 12)) * idle;
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity, pointerEvents: "none", zIndex: 100 }}>
      {click && (
        <div
          style={{
            position: "absolute",
            left: -18 * ripple - 4,
            top: -18 * ripple - 4,
            width: 8 + 36 * ripple,
            height: 8 + 36 * ripple,
            borderRadius: "50%",
            border: "2px solid rgba(31, 78, 121, 0.55)",
            opacity: 1 - ripple,
          }}
        />
      )}
      <svg width="22" height="30" viewBox="0 0 22 30" style={{ transform: `scale(${1 - press * 0.15})`, transformOrigin: "2px 2px", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.3))" }}>
        <path d="M2 2 L2 24 L7.5 18.5 L11 27 L14.5 25.5 L11 17 L19 17 Z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
