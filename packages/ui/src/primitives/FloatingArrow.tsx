/**
 * 浮层菱形箭头 —— 8px 旋转方块（对应引擎 ARROW_SIZE 常量）、尖端单角 2.5px 圆角，
 * 几何与 D-004 Tooltip 箭头同源。配色按浮层底色分两档：tooltip = 反相（ink-1 底 +
 * ink-inverse 描边）；surface = 亮底（Popover 用）。贴哪条边与 left/top 投影值由
 * 定位引擎写入 inline style（anchoredPosition 的 applyArrowPosition）；本组件只
 * 负责随宿主 data-side 的旋转与描边形态——宿主容器需带 `group/float` 类并写 data-side。
 */

import { cn } from "../cn";

export type FloatingArrowTone = "tooltip" | "surface";

export function FloatingArrow({ tone = "surface" }: { tone?: FloatingArrowTone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute size-2",
        tone === "tooltip" ? "border-ink-inverse/15 bg-ink-1" : "border-line-1 bg-surface",
        // 不能用 border 打底（四边描边）：内侧两条边藏在浮层主体里不该有框，
        // 只描旋转后朝外的两条斜边。top/bottom 尖端=右下角 → 描 right/bottom、圆右下角；
        // left/right 尖端=左上角 → 描 left/top、圆左上角
        "group-data-[side=top]/float:rotate-45",
        "group-data-[side=top]/float:rounded-br-[2.5px] group-data-[side=top]/float:border-b group-data-[side=top]/float:border-r",
        "group-data-[side=bottom]/float:rotate-[225deg]",
        "group-data-[side=bottom]/float:rounded-br-[2.5px] group-data-[side=bottom]/float:border-b group-data-[side=bottom]/float:border-r",
        "group-data-[side=left]/float:rotate-[135deg]",
        "group-data-[side=left]/float:rounded-tl-[2.5px] group-data-[side=left]/float:border-l group-data-[side=left]/float:border-t",
        "group-data-[side=right]/float:-rotate-45",
        "group-data-[side=right]/float:rounded-tl-[2.5px] group-data-[side=right]/float:border-l group-data-[side=right]/float:border-t"
      )}
    />
  );
}
