import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@tau/ui";

import { BOARD_TO_CONTAINER } from "../../constants";
import { useBoard, useBoardState, useViewPort } from "../../hooks";
import type { BoardElement, MindNodeElement } from "../../types";
import { AttrBarContext, ChromeBar } from "../../chrome";

/** 工具条占据的顶部区域（top-3 + 38px 高 + 余量）：属性条不压到它 */
const TOP_RESERVED = 58;
const GAP = 12;
const EDGE = 8;

function getMindNodeSelfBounds({ x, y, width, height }: MindNodeElement) {
  return { minX: x, minY: y, maxX: x + width, maxY: y + height };
}

/**
 * 属性浮动条（D-049）：浮在选中元素上方 12px、水平居中；上方放不下时翻到元素下方，
 * 此时条目弹层改为向下展开（AttrBarContext.side）。拖动 / 缩放元素时隐去，松手回来。
 * 选区完全移出视口时不显示。
 */
export default function FloatingAttrBar({
  elements,
  children,
}: {
  elements: BoardElement[];
  children: ReactNode;
}) {
  const board = useBoard();
  const viewPort = useViewPort();
  const { isMoving } = useBoardState();
  const barRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const container = BOARD_TO_CONTAINER.get(board);
  const cw = container?.clientWidth ?? 0;
  const ch = container?.clientHeight ?? 0;
  const scale = viewPort.width > 0 ? cw / viewPort.width : viewPort.zoom;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const el of elements) {
    // mind-node 的 getBounds 是整棵子树的包围盒，属性条只贴着节点自身
    const b =
      el.type === "mind-node" ? getMindNodeSelfBounds(el as MindNodeElement) : board.getBounds(el);
    if (!b) continue;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  const box = Number.isFinite(minX)
    ? {
        left: (minX - viewPort.minX) * scale,
        top: (minY - viewPort.minY) * scale,
        right: (maxX - viewPort.minX) * scale,
        bottom: (maxY - viewPort.minY) * scale,
      }
    : null;
  const offscreen = !box || box.right < 0 || box.bottom < 0 || box.left > cw || box.top > ch;

  let side: "top" | "bottom" = "top";
  let top = 0;
  let left = 0;
  if (box) {
    top = box.top - size.h - GAP;
    if (top < TOP_RESERVED) {
      side = "bottom";
      top = box.bottom + GAP;
    }
    top = Math.max(TOP_RESERVED, Math.min(top, ch - size.h - EDGE));
    // 垂直 clamp 可能把条压回元素上方（上下都放不下时），按最终位置回算弹层展开方向
    side = top < box.top ? "top" : "bottom";
    left = Math.max(EDGE, Math.min((box.left + box.right) / 2 - size.w / 2, cw - size.w - EDGE));
  }

  return (
    <AttrBarContext.Provider value={{ side }}>
      <ChromeBar
        ref={barRef}
        style={{ left, top }}
        className={cn(
          "ease-tau-out z-[7] transition-opacity duration-150",
          (isMoving || offscreen || size.w === 0) && "pointer-events-none opacity-0"
        )}
      >
        {children}
      </ChromeBar>
    </AttrBarContext.Provider>
  );
}
