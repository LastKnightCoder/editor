/**
 * 手绘渲染的输出单元：纯数据，由组件渲染为 <path>。
 * - ink：墨迹（填充多边形）
 * - wash：淡涂填充
 * - lines：线类填充（斜线 / 交叉 / 涂鸦），深色主题下需要再退一步
 */
export interface SketchPath {
  role: "ink" | "wash" | "lines";
  d: string;
  color: string;
  opacity?: number;
  /** 限制在此轮廓内（线类填充） */
  clip?: string;
  /** 虚线遮罩：沿中心线描粗虚线，墨迹只露出虚线段 */
  dashMask?: DashMask;
}

export interface DashMask {
  d: string;
  width: number;
  dash: number;
  gap: number;
}
