/**
 * 浮层定位引擎（Tooltip / Select / Menu / Popover 共用，D-004；D-013 起更名
 * anchoredPosition——四家消费后不再顶着 tooltip 专名）——不依赖 React，可单独单测。
 * 中间件链：offset（间距默认 8）→ flip（主轴放不下翻对侧）→ shift（夹回视口，边距 8）→
 * arrow（锚点中心在边缘上的投影，两端各留 10px）。
 * 独立成文件：组件文件只导出组件（react-refresh 约束）。
 *
 * shift 的闸门：**锚点与视口不相交时完全不夹**。无条件夹会让锚点滚出视口后浮层
 * 被强行钉在视口边缘、与锚点脱钩——一屏多个离屏锚点就全挤在同一条边上。锚点
 * 离屏时让它自然跟随锚点离屏即可——几何上就不可见，无需额外的显示态管理。
 */

export type AnchoredSide = "top" | "right" | "bottom" | "left";
export type AnchoredAlign = "start" | "center" | "end";
export type AnchoredPlacement = AnchoredSide | `${AnchoredSide}-${AnchoredAlign}`;

const VIEWPORT_PAD = 8; // shift 夹回视口时留的边距
const ARROW_MARGIN = 10; // 箭头距浮层角的最小距离
/** 箭头边长（8px）与菱形中心到所在边的偏移（半宽 4 + 1px 边框），对应 FloatingArrow 的 size-2 与描边 */
const ARROW_SIZE = 8;
const ARROW_TIP_OFFSET = 5;

/** 引擎可选参数：gap 覆写与锚点的间距（Select/Menu 下拉用 4，Tooltip/Popover 用默认 8）。 */
export interface AnchoredPositionOptions {
  gap?: number;
}

export interface AnchoredPosition {
  x: number;
  y: number;
  side: AnchoredSide;
  arrowX: number | null;
  arrowY: number | null;
}

/**
 * anchor 为触发器矩形；pop 只需要尺寸（jsdom 可用普通对象伪造）。
 */
export function computeAnchoredPosition(
  anchor: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  },
  pop: { offsetWidth: number; offsetHeight: number },
  placement: AnchoredPlacement,
  opts?: AnchoredPositionOptions
): AnchoredPosition {
  const GAP = opts?.gap ?? 8;
  const [side0, align = "center"] = placement.split("-") as [AnchoredSide, AnchoredAlign?];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // flip：主轴放不下翻对侧（对侧也放不下保原位，靠 shift 兜底不遮锚点）
  const space = (sd: AnchoredSide) =>
    sd === "top"
      ? anchor.top - GAP
      : sd === "bottom"
        ? vh - anchor.bottom - GAP
        : sd === "left"
          ? anchor.left - GAP
          : vw - anchor.right - GAP;
  const opposite: Record<AnchoredSide, AnchoredSide> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  // 判"放得下"要用主轴上的占位尺寸：上下位是高度、左右位是宽度。
  // 原实现一律拿 offsetHeight 比，左右位因此会在"横向明明放不下"时误判为放得下，
  // 结果被 shift 钉在视口侧边、压住锚点。
  const extent = side0 === "top" || side0 === "bottom" ? pop.offsetHeight : pop.offsetWidth;
  const side = space(side0) >= extent || space(opposite[side0]) < extent ? side0 : opposite[side0];

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

  // shift：夹回视口 —— 只在锚点还看得见时做（见文件头「shift 的闸门」）
  const anchorInView = anchor.bottom > 0 && anchor.top < vh && anchor.right > 0 && anchor.left < vw;
  if (anchorInView) {
    x = Math.max(VIEWPORT_PAD, Math.min(x, vw - VIEWPORT_PAD - pop.offsetWidth));
    y = Math.max(VIEWPORT_PAD, Math.min(y, vh - VIEWPORT_PAD - pop.offsetHeight));
  }

  // arrow：锚点中心投影到浮层对应边缘；偏移让菱形中心落在边框外缘（absolute 包含块是 padding box）
  let arrowX: number | null = null;
  let arrowY: number | null = null;
  if (side === "top" || side === "bottom")
    arrowX = Math.max(
      ARROW_MARGIN,
      Math.min(
        anchor.left + anchor.width / 2 - x - ARROW_TIP_OFFSET,
        pop.offsetWidth - ARROW_MARGIN - ARROW_SIZE
      )
    );
  else
    arrowY = Math.max(
      ARROW_MARGIN,
      Math.min(
        anchor.top + anchor.height / 2 - y - ARROW_TIP_OFFSET,
        pop.offsetHeight - ARROW_MARGIN - ARROW_SIZE
      )
    );

  return { x, y, side, arrowX, arrowY };
}

/**
 * 引擎投影值 → 箭头 inline 定位。箭头须为浮层的 firstElementChild（含箭头时）；
 * 每条边都显式写入（另一侧置 auto），side 翻转后不留上一姿态的残留。
 */
export function applyArrowPosition(
  { side, arrowX, arrowY }: AnchoredPosition,
  pop: HTMLElement
): void {
  const ar = pop.firstElementChild as HTMLElement | null;
  if (!ar) return;
  if (arrowX != null) {
    ar.style.left = `${arrowX}px`;
    ar.style.top = side === "bottom" ? `-${ARROW_TIP_OFFSET}px` : "auto";
    ar.style.bottom = side === "top" ? `-${ARROW_TIP_OFFSET}px` : "auto";
    ar.style.right = "auto";
  } else {
    ar.style.top = `${arrowY}px`;
    ar.style.left = side === "right" ? `-${ARROW_TIP_OFFSET}px` : "auto";
    ar.style.right = side === "left" ? `-${ARROW_TIP_OFFSET}px` : "auto";
    ar.style.bottom = "auto";
  }
}
