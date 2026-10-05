/**
 * 相机：world ↔ canvas 坐标变换、平移缩放、带缓动的飞行。
 *
 * 纯数据对象，不碰 DOM 事件也不碰 canvas —— 交互层负责把事件翻译成
 * panBy/zoomAt 调用，渲染器只读当前 transform。这样飞行动画可以单测。
 */

import type { CameraTransform } from "./types";

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

/** easeOutCubic：起步快、收尾稳，镜头飞行用它不会有「甩过去」的感觉 */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export interface FlightTarget {
  x: number;
  y: number;
  scale: number;
}

export class Camera {
  private transform: CameraTransform = { scale: 1, offsetX: 0, offsetY: 0 };
  private flight: {
    from: CameraTransform;
    to: CameraTransform;
    start: number;
    duration: number;
  } | null = null;

  constructor(
    private width: number,
    private height: number
  ) {}

  setViewport(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  get current(): CameraTransform {
    return this.transform;
  }

  get scale() {
    return this.transform.scale;
  }

  get isFlying() {
    return this.flight !== null;
  }

  toCanvas(x: number, y: number): [number, number] {
    const { scale, offsetX, offsetY } = this.transform;
    return [(x + offsetX) * scale, (y + offsetY) * scale];
  }

  toWorld(x: number, y: number): [number, number] {
    const { scale, offsetX, offsetY } = this.transform;
    return [x / scale - offsetX, y / scale - offsetY];
  }

  /** 画布像素位移；拖拽画布时直接传 delta */
  panBy(dx: number, dy: number) {
    this.cancelFlight();
    this.transform = {
      ...this.transform,
      offsetX: this.transform.offsetX + dx / this.transform.scale,
      offsetY: this.transform.offsetY + dy / this.transform.scale,
    };
  }

  /** 以画布上某点为锚缩放（滚轮），锚点下的世界坐标保持不动 */
  zoomAt(canvasX: number, canvasY: number, factor: number) {
    this.cancelFlight();
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.transform.scale * factor));
    if (next === this.transform.scale) return;
    const [worldX, worldY] = this.toWorld(canvasX, canvasY);
    this.transform = {
      scale: next,
      offsetX: canvasX / next - worldX,
      offsetY: canvasY / next - worldY,
    };
  }

  /** 世界坐标包围盒填满视口（留 padding 像素） */
  fit(bounds: { minX: number; minY: number; maxX: number; maxY: number }, padding = 48) {
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min((this.width - padding * 2) / w, (this.height - padding * 2) / h))
    );
    this.cancelFlight();
    this.transform = this.centeredOn(
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      scale
    );
  }

  /** 飞到某个世界坐标；duration 为 0 时立即到位 */
  flyTo(target: FlightTarget, duration = 500, now = performance.now()) {
    const to = this.centeredOn(
      target.x,
      target.y,
      Math.min(MAX_SCALE, Math.max(MIN_SCALE, target.scale))
    );
    if (duration <= 0) {
      this.flight = null;
      this.transform = to;
      return;
    }
    this.flight = { from: this.transform, to, start: now, duration };
  }

  /**
   * 推进飞行动画。返回 true 表示 transform 有变化、需要重绘。
   * 由宿主的 raf 循环每帧调用一次。
   */
  advance(now: number): boolean {
    if (!this.flight) return false;
    const { from, to, start, duration } = this.flight;
    const t = Math.min(1, (now - start) / duration);
    const k = easeOutCubic(t);
    // scale 在对数空间插值：线性插值会让缩放前半段过快
    const scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * k);
    this.transform = {
      scale,
      offsetX: from.offsetX + (to.offsetX - from.offsetX) * k,
      offsetY: from.offsetY + (to.offsetY - from.offsetY) * k,
    };
    if (t >= 1) this.flight = null;
    return true;
  }

  /** 直接设回某个视角（先算目标视角、再从原视角飞过去时用） */
  restore(transform: CameraTransform) {
    this.cancelFlight();
    this.transform = { ...transform };
  }

  private cancelFlight() {
    this.flight = null;
  }

  private centeredOn(x: number, y: number, scale: number): CameraTransform {
    return {
      scale,
      offsetX: this.width / 2 / scale - x,
      offsetY: this.height / 2 / scale - y,
    };
  }
}
