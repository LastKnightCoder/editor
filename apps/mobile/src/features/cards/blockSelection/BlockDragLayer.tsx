import { useLayoutEffect, useRef } from "react";
import { cloneBlockForDrag, resolveDropLineTop, type BlockDragState } from "./blockDrag";

/** 提起浮层的内边距（py-2），浮层上移同样距离使克隆内容与原块对齐 */
const LIFTED_PADDING_Y = 8;

type BlockDragLayerProps = {
  drag: BlockDragState | null;
};

/**
 * 编辑器内拖拽块的覆盖层：原位置虚线占位、提起的克隆块、插入线。
 * 渲染在编辑器外层 relative 包裹内；拖拽期间原块 DOM 透明，结束后恢复。
 */
export function BlockDragLayer({ drag }: BlockDragLayerProps) {
  const liftedRef = useRef<HTMLDivElement | null>(null);
  const blockDom = drag?.blockDom ?? null;

  useLayoutEffect(() => {
    const lifted = liftedRef.current;
    if (!blockDom || !lifted) return;
    // 克隆脱离编辑器根节点后继承不到正文字号与行高，按原块计算值补上
    const computed = getComputedStyle(blockDom);
    lifted.style.fontSize = computed.fontSize;
    lifted.style.lineHeight = computed.lineHeight;
    lifted.style.color = computed.color;
    lifted.replaceChildren(cloneBlockForDrag(blockDom));
    const previousOpacity = blockDom.style.opacity;
    blockDom.style.opacity = "0";
    return () => {
      blockDom.style.opacity = previousOpacity;
      lifted.replaceChildren();
    };
  }, [blockDom]);

  if (!drag) return null;
  const rect = drag.rects[drag.from];
  if (!rect) return null;

  return (
    <>
      <div
        data-block-drag-placeholder="true"
        aria-hidden="true"
        className="border-line-1 pointer-events-none absolute -left-1.5 -right-1.5 rounded-[10px] border-[1.5px] border-dashed"
        style={{ top: rect.top, height: rect.height }}
      />
      {/* 落点仍在原位时不画插入线：松手不会移动 */}
      {drag.to !== drag.from ? (
        <div
          data-block-drop-line="true"
          aria-hidden="true"
          className="bg-accent before:bg-accent pointer-events-none absolute -left-1.5 right-0 z-20 h-[3px] rounded-full before:absolute before:-left-[5px] before:-top-[3.5px] before:h-2.5 before:w-2.5 before:rounded-full"
          style={{ top: resolveDropLineTop(drag.rects, drag.from, drag.to) }}
        />
      ) : null}
      <div
        ref={liftedRef}
        data-block-drag-lifted="true"
        aria-hidden="true"
        className="bg-surface shadow-float pointer-events-none absolute -left-3 -right-3 z-20 origin-top-left rounded-xl px-3 py-2"
        style={{
          top: rect.top - LIFTED_PADDING_Y,
          transform: `translateY(${drag.offsetY}px) scale(1.03) rotate(-0.6deg)`,
        }}
      />
    </>
  );
}

export default BlockDragLayer;
