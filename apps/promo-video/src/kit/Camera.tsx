import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { ease, type EaseFn } from "../brand/motion";
import { VIDEO } from "../brand/tokens";

/** 镜头关键帧：在 at 帧时，画面中心对准世界坐标 (x, y)，缩放 zoom；ease 作用于抵达本帧的那一段 */
/** dip：这一段途中先拉远再推近的幅度（0.3 = 中点缩小 30%），用于窗口之间的「飞越」 */
export type Shot = { at: number; x: number; y: number; zoom: number; ease?: EaseFn; dip?: number };

export type CameraState = { x: number; y: number; zoom: number };

/** 缩放在对数空间插值：推拉镜头的视觉速度才是匀的，线性插值会「先猛后缓」 */
export function cameraAt(frame: number, shots: Shot[]): CameraState {
  if (frame <= shots[0].at) return shots[0];
  for (let i = 1; i < shots.length; i++) {
    const to = shots[i];
    if (frame > to.at) continue;
    const from = shots[i - 1];
    const t = (to.ease ?? ease.inOut)((frame - from.at) / (to.at - from.at));
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      zoom: Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * t) * (1 - (to.dip ?? 0) * Math.sin(Math.PI * t)),
    };
  }
  return shots[shots.length - 1];
}

/** 无限画布：子元素用世界坐标绝对定位，镜头决定可见区域 */
export function World({ shots, children, style }: { shots: Shot[]; children: ReactNode | ((camera: CameraState) => ReactNode); style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const camera = cameraAt(frame, shots);
  const { x, y, zoom } = camera;
  return (
    <div className="absolute inset-0 overflow-hidden" style={style}>
      <div
        className="absolute top-0 left-0"
        style={{
          transformOrigin: "0 0",
          transform: `translate(${VIDEO.width / 2}px, ${VIDEO.height / 2}px) scale(${zoom}) translate(${-x}px, ${-y}px)`,
        }}
      >
        {typeof children === "function" ? children(camera) : children}
      </div>
    </div>
  );
}

/** 世界坐标 → 画面坐标 */
export function project(camera: CameraState, wx: number, wy: number) {
  return {
    x: VIDEO.width / 2 + (wx - camera.x) * camera.zoom,
    y: VIDEO.height / 2 + (wy - camera.y) * camera.zoom,
  };
}

/** 世界坐标中的矩形是否落在画面内（含边距），用于剔除画外窗口 */
export function inView(camera: CameraState, cx: number, cy: number, w: number, h: number, margin = 200) {
  const halfW = VIDEO.width / 2 / camera.zoom + margin;
  const halfH = VIDEO.height / 2 / camera.zoom + margin;
  return Math.abs(cx - camera.x) < halfW + w / 2 && Math.abs(cy - camera.y) < halfH + h / 2;
}

/** 世界坐标中的一块：以 (x, y) 为中心放置 */
export function Place({ x, y, children, style }: { x: number; y: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="absolute" style={{ left: x, top: y, transform: "translate(-50%, -50%)", ...style }}>
      {children}
    </div>
  );
}
