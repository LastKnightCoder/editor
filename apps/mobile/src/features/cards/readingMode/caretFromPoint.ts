export type CaretHit = { node: Node; offset: number };

/** 屏幕坐标处的 DOM 光标位置；优先标准 caretPositionFromPoint，回退 WebKit 的 caretRangeFromPoint */
export function caretFromPoint(x: number, y: number): CaretHit | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }
  const legacy = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => globalThis.Range | null;
  };
  const range = legacy.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}
