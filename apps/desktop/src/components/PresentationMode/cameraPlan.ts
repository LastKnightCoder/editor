/**
 * 镜头计划：一节内容怎么放进固定画框。
 * 放得下居中 → 略长整体缩小（不低于 SHRINK_LIMIT）→ 再长按块边界切成若干屏，
 * 画框不动、内容在框内逐屏上移。
 */

export interface BlockBox {
  /** 相对内容轨道顶部的逻辑像素 */
  top: number;
  height: number;
  heading: boolean;
}

export interface CameraPlan {
  /** 整体缩放（仅单屏时可能小于 1） */
  fit: number;
  /** 每屏的内容偏移（逻辑像素），首屏恒为 0 */
  steps: number[];
  /** 内容总高 */
  total: number;
  /** 单屏时垂直居中 */
  centered: boolean;
}

export const SHRINK_LIMIT = 0.8;
/** 单块高过一屏时的块内推进比例，保留一行上下文 */
const OVERSIZE_ADVANCE = 0.85;
/** 防御：极端内容下的屏数上限 */
const MAX_STEPS = 200;

export const SINGLE_SCREEN: CameraPlan = { fit: 1, steps: [0], total: 0, centered: true };

export function planCamera(blocks: readonly BlockBox[], viewport: number): CameraPlan {
  const total = blocks.reduce((max, block) => Math.max(max, block.top + block.height), 0);
  if (total <= viewport) return { fit: 1, steps: [0], total, centered: true };
  if (total * SHRINK_LIMIT <= viewport)
    return { fit: viewport / total, steps: [0], total, centered: true };

  const steps = [0];
  let offset = 0;
  while (offset + viewport < total && steps.length < MAX_STEPS) {
    const limit = offset + viewport;
    const cut = blocks.findIndex(block => block.top + block.height > limit);
    let next = cut >= 0 ? blocks[cut].top : limit;
    // 标题不落单：屏底的标题随下一块进下一屏
    const prev = blocks[cut - 1];
    if (cut > 0 && prev.heading && prev.top > offset) next = prev.top;
    if (next <= offset) next = offset + viewport * OVERSIZE_ADVANCE;
    steps.push(next);
    offset = next;
  }
  // 末屏让内容底边贴视口底边，不留大段空白
  steps[steps.length - 1] = Math.min(steps[steps.length - 1], total - viewport);
  return { fit: 1, steps, total, centered: false };
}

/** 当前屏下方是否还有内容 */
export function hasMoreBelow(plan: CameraPlan, step: number, viewport: number) {
  return (plan.steps[step] ?? 0) + viewport < plan.total - 1;
}
