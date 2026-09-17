/**
 * Tooltip 定位引擎（方案 B 定稿，mockups/tooltip/plan-b-engine.html）——纯函数，不依赖 React。
 * 中间件链：offset（间距 8）→ flip（主轴放不下翻对侧）→ shift（交叉轴夹回视口，边距 8）→
 * arrow（锚点中心在边缘上的投影，两端各留 10px）。
 * 独立成文件：Tooltip.tsx 只导出组件（react-refresh 约束），引擎可单独单测。
 */

export type TooltipSide = "top" | "right" | "bottom" | "left";
export type TooltipAlign = "start" | "center" | "end";
export type TooltipPlacement = TooltipSide | `${TooltipSide}-${TooltipAlign}`;

const GAP = 8; // 与锚点的间距（offset 中间件）
const VIEWPORT_PAD = 8; // shift 夹回视口时留的边距
const ARROW_MARGIN = 10; // 箭头距 tooltip 角的最小距离

export interface TooltipPosition {
  x: number;
  y: number;
  side: TooltipSide;
  arrowX: number | null;
  arrowY: number | null;
}

/**
 * anchor 为触发器矩形；pop 只需要尺寸（jsdom 可用普通对象伪造）。
 */
export function computeTooltipPosition(
  anchor: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  },
  pop: { offsetWidth: number; offsetHeight: number },
  placement: TooltipPlacement
): TooltipPosition {
  const [side0, align = "center"] = placement.split("-") as [TooltipSide, TooltipAlign?];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // flip：主轴放不下翻对侧（对侧也放不下保原位，靠 shift 兜底不遮锚点）
  const space = (sd: TooltipSide) =>
    sd === "top"
      ? anchor.top - GAP
      : sd === "bottom"
        ? vh - anchor.bottom - GAP
        : sd === "left"
          ? anchor.left - GAP
          : vw - anchor.right - GAP;
  const opposite: Record<TooltipSide, TooltipSide> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  const side =
    space(side0) >= pop.offsetHeight || space(opposite[side0]) < pop.offsetHeight
      ? side0
      : opposite[side0];

  // 主轴贴 GAP，交叉轴按 align
  let x = 0;
  let y = 0;
  if (side === "top") y = anchor.top - GAP - pop.offsetHeight;
  if (side === "bottom") y = anchor.bottom + GAP;
  if (side === "left") x = anchor.left - GAP - pop.offsetWidth;
  if (side === "right") x = anchor.right + GAP;
  if (side === "top" || side === "bottom") {
    if (align === "start") x = anchor.left;
    if (align === "center") x = anchor.left + anchor.width / 2 - pop.offsetWidth / 2;
    if (align === "end") x = anchor.right - pop.offsetWidth;
  } else {
    if (align === "start") y = anchor.top;
    if (align === "center") y = anchor.top + anchor.height / 2 - pop.offsetHeight / 2;
    if (align === "end") y = anchor.bottom - pop.offsetHeight;
  }

  // shift：交叉轴夹回视口
  x = Math.max(VIEWPORT_PAD, Math.min(x, vw - VIEWPORT_PAD - pop.offsetWidth));
  y = Math.max(VIEWPORT_PAD, Math.min(y, vh - VIEWPORT_PAD - pop.offsetHeight));

  // arrow：锚点中心投影到 tooltip 对应边缘；-5 让菱形中心落在边框外缘（absolute 包含块是 padding box）
  let arrowX: number | null = null;
  let arrowY: number | null = null;
  if (side === "top" || side === "bottom")
    arrowX = Math.max(
      ARROW_MARGIN,
      Math.min(anchor.left + anchor.width / 2 - x - 5, pop.offsetWidth - ARROW_MARGIN - 8)
    );
  else
    arrowY = Math.max(
      ARROW_MARGIN,
      Math.min(anchor.top + anchor.height / 2 - y - 5, pop.offsetHeight - ARROW_MARGIN - 8)
    );

  return { x, y, side, arrowX, arrowY };
}
