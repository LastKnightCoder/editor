import type { ItemRect } from "../outline/usePointerReorder";
import type { BlockRect } from "./measureBlocks";

/** 插入线与相邻块边界的间距（px） */
export const DROP_LINE_GAP = 3;

/** 编辑器内拖拽块的渲染状态；位置均相对编辑器包裹元素 */
export type BlockDragState = {
  from: number;
  /** 移除被拖块后的插入位 */
  to: number;
  /** 被拖块的纵向位移（含滚动增量） */
  offsetY: number;
  /** 拖拽开始时各顶层块的位置；拖拽中其他块不让位，位置不变 */
  rects: ItemRect[];
  /** 被拖块的 DOM */
  blockDom: HTMLElement;
};

/** 测量失败的块按前一块底边记为零高度，保持下标与 editor.children 对齐 */
export function fillBlockRects(rects: ReadonlyArray<BlockRect | null>): ItemRect[] {
  let bottom = 0;
  return rects.map(rect => {
    if (!rect) return { top: bottom, height: 0 };
    bottom = rect.top + rect.height;
    return { top: rect.top, height: rect.height };
  });
}

/**
 * 插入线的 top：插到原下标 i 之前取块 i 的 top − 间距，插到末尾取最后一块底边 + 间距。
 * to 为移除被拖块后的插入位，换算回原下标时 to > from 需加一。
 */
export function resolveDropLineTop(rects: readonly ItemRect[], from: number, to: number): number {
  const before = to <= from ? to : to + 1;
  const target = rects[before];
  if (target) return target.top - DROP_LINE_GAP;
  const last = rects[rects.length - 1];
  return last ? last.top + last.height + DROP_LINE_GAP : 0;
}

/** 克隆块 DOM 作为提起的浮层内容：移除 contenteditable、data-slate-* 与 id，避免被 Slate 识别为编辑器节点 */
export function cloneBlockForDrag(blockDom: HTMLElement): HTMLElement {
  const clone = blockDom.cloneNode(true) as HTMLElement;
  for (const element of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    for (const name of element.getAttributeNames()) {
      if (name === "contenteditable" || name === "id" || name.startsWith("data-slate")) {
        element.removeAttribute(name);
      }
    }
  }
  clone.style.opacity = "";
  clone.style.margin = "0";
  return clone;
}
