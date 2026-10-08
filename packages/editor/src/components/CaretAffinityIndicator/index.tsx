import { memo, useLayoutEffect, useRef } from "react";
import type { Editor } from "slate";
import {
  ReactEditor,
  useComposing,
  useFocused,
  useReadOnly,
  useSlateSelector,
  useSlateStatic,
} from "slate-react";

import { getCaretAffinity, type CaretAffinitySide } from "../../utils/caretAffinity";

interface CaretRect {
  left: number;
  bottom: number;
}

const firstRect = (range: globalThis.Range) => {
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  return rect.height > 0 ? rect : null;
};

/** 取浏览器实际光标的位置（落在零宽占位里时也以它为准），不在本编辑器内时返回 null */
const getCaretRect = (editor: Editor): CaretRect | null => {
  const domSelection = ReactEditor.getWindow(editor).getSelection();
  if (!domSelection || domSelection.rangeCount === 0 || !domSelection.isCollapsed) return null;
  const range = domSelection.getRangeAt(0);
  const { startContainer: node, startOffset: offset } = range;
  if (!ReactEditor.toDOMNode(editor, editor).contains(node)) return null;
  const rect = firstRect(range);
  if (rect) return rect;
  // Chromium 对文本开头的折叠选区常返回零矩形，改量光标后（或前）一个字符
  const [text, textOffset] = resolveTextPosition(node, offset);
  if (!text) return null;
  const probe = text.ownerDocument.createRange();
  if (textOffset < text.length) {
    probe.setStart(text, textOffset);
    probe.setEnd(text, textOffset + 1);
    const next = firstRect(probe);
    return next && { left: next.left, bottom: next.bottom };
  }
  if (textOffset > 0) {
    probe.setStart(text, textOffset - 1);
    probe.setEnd(text, textOffset);
    const previous = firstRect(probe);
    return previous && { left: previous.right, bottom: previous.bottom };
  }
  return null;
};

const isEditableText = (node: globalThis.Node): node is Text =>
  node.nodeType === globalThis.Node.TEXT_NODE &&
  !node.parentElement?.closest('[contenteditable="false"]') &&
  (node.nodeValue?.length ?? 0) > 0;

/** 把落在元素上的选区位置换成相邻的可编辑文本位置（优先其后的文本） */
const resolveTextPosition = (node: globalThis.Node, offset: number): [Text | null, number] => {
  if (node.nodeType === globalThis.Node.TEXT_NODE) return [node as Text, offset];
  const walker = node.ownerDocument!.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (isEditableText(current)) texts.push(current);
  }
  const boundary = node.childNodes[offset];
  const after = texts.find(
    text =>
      !boundary ||
      boundary === text ||
      boundary.contains(text) ||
      Boolean(boundary.compareDocumentPosition(text) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING)
  );
  if (after) return [after, 0];
  const before = texts[texts.length - 1];
  return before ? [before, before.length] : [null, 0];
};

const ArrowIcon = ({ side }: { side: CaretAffinitySide }) => {
  if (side === "middle") {
    return (
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
        <circle cx="4" cy="4" r="1.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      width="10"
      height="8"
      viewBox="0 0 10 8"
      aria-hidden
      className={side === "left" ? "-scale-x-100" : undefined}
    >
      <path
        d="M1 4h7M5.5 1.5 8 4 5.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/**
 * 光标偏向指示：光标停在格式 / 行内元素边界时，在光标正下方用箭头标出下一次输入的归属侧
 * （← 沿用左侧，→ 归入右侧）。固定定位，随选区、滚动与窗口尺寸重新定位。
 */
const CaretAffinityIndicator = memo(() => {
  const editor = useSlateStatic();
  const focused = useFocused();
  const composing = useComposing();
  const readOnly = useReadOnly();
  const side = useSlateSelector(getCaretAffinity);
  const ref = useRef<HTMLDivElement>(null);
  const active = side !== null && focused && !composing && !readOnly;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const rect = getCaretRect(editor);
      if (!rect) {
        element.style.display = "none";
        return;
      }
      // 祖先有 CSS zoom（沉浸写作）时 fixed 坐标也会被放大，按实际缩放反除
      const zoom = (element as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
      element.style.display = "block";
      element.style.left = `${rect.left / zoom}px`;
      element.style.top = `${(rect.bottom + 1) / zoom}px`;
    };
    // slate-react 在布局阶段之后才同步 DOM 选区，放到下一帧再取位置
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    schedule();
    const ownerDocument = element.ownerDocument;
    const view = ownerDocument.defaultView ?? window;
    ownerDocument.addEventListener("selectionchange", schedule);
    view.addEventListener("scroll", schedule, true);
    view.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ownerDocument.removeEventListener("selectionchange", schedule);
      view.removeEventListener("scroll", schedule, true);
      view.removeEventListener("resize", schedule);
    };
  }, [active, side, editor]);

  if (!active) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      style={{ display: "none" }}
      className="pointer-events-none fixed z-[9998] -translate-x-1/2 leading-none text-current opacity-75"
    >
      <ArrowIcon side={side} />
    </div>
  );
});

CaretAffinityIndicator.displayName = "CaretAffinityIndicator";

export default CaretAffinityIndicator;
