/**
 * 悬停预览面板的摆放：面板不能盖住被悬停的节点和它的标题，否则鼠标挪不回节点、没法点开详情。
 *
 * 定位引擎只会在主轴上翻对侧，两侧都放不下时靠夹回视口兜底——那一下正好压在锚点上。
 * 所以这里先按四个方向的剩余空间挑一侧：上下能完整放下优先，其次左右；都放不下就放上下
 * 里空间大的一侧，并把面板高度收到那一侧的空间里。
 */

import type { Box } from "../renderers/Canvas2DRenderer";

export type PreviewPlacement = "bottom-start" | "top-start" | "right-start" | "left-start";

/** 引擎的锚点间距（8）+ 夹回视口的边距（8） */
const MARGIN = 16;
/** 面板上下边框 */
const BORDER = 2;

export interface PreviewPlace {
  placement: PreviewPlacement;
  /** 正文高度上限 */
  maxHeight: number;
}

/**
 * box 是节点 + 标题的占位框（视口坐标）；panel 是面板宽度与正文高度上限；
 * viewport 是视口尺寸。
 */
export function placePreview(
  box: Box,
  panel: { width: number; maxHeight: number },
  viewport: { width: number; height: number }
): PreviewPlace {
  const height = panel.maxHeight + BORDER;
  const below = viewport.height - box.bottom - MARGIN;
  const above = box.top - MARGIN;
  const full = { maxHeight: panel.maxHeight };
  if (below >= height) return { placement: "bottom-start", ...full };
  if (above >= height) return { placement: "top-start", ...full };
  if (viewport.width - box.right - MARGIN >= panel.width) {
    return { placement: "right-start", ...full };
  }
  if (box.left - MARGIN >= panel.width) return { placement: "left-start", ...full };
  const placement = below >= above ? "bottom-start" : "top-start";
  return { placement, maxHeight: Math.max(0, Math.floor(Math.max(below, above)) - BORDER) };
}
