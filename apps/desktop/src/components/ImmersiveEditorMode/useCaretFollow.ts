import { useCallback, useEffect } from "react";
import { caretScrollDelta, type FollowMode } from "./layout";

/** 空行 / void 块拿不到折叠选区的矩形时，退回所在元素顶部一行的高度 */
const FALLBACK_LINE = 32;

function caretY(root: HTMLElement): number | null {
  const selection = window.getSelection();
  const node = selection?.focusNode;
  if (!selection || !node || !root.contains(node)) return null;
  const range = document.createRange();
  range.setStart(node, selection.focusOffset);
  const rect = range.getBoundingClientRect();
  if (rect.height > 0) return rect.top + rect.height / 2;
  const element = node instanceof Element ? node : node.parentElement;
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return box.top + Math.min(box.height, FALLBACK_LINE) / 2;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 光标跟随：只响应键盘引起的光标移动（输入、换行、方向键、粘贴），鼠标点击与滚轮回看不打断阅读位置。
 * 返回 follow(instant)，供切换模式 / 缩放后立即对齐。
 */
export function useCaretFollow(
  viewport: HTMLElement | null,
  root: HTMLElement | null,
  mode: FollowMode
) {
  const follow = useCallback(
    (instant = false) => {
      if (!viewport || !root) return;
      const y = caretY(root);
      if (y === null) return;
      const top = viewport.getBoundingClientRect().top;
      const delta = caretScrollDelta(y - top, viewport.clientHeight, mode);
      if (!delta) return;
      viewport.scrollTo({
        top: viewport.scrollTop + delta,
        behavior: instant || reducedMotion() ? "auto" : "smooth",
      });
    },
    [viewport, root, mode]
  );

  useEffect(() => {
    if (!root) return;
    let fromKeyboard = false;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => follow());
    };
    const onKeyDown = (e: KeyboardEvent) => {
      fromKeyboard = root.contains(e.target as Node);
    };
    const onPointerDown = () => {
      fromKeyboard = false;
    };
    const onSelectionChange = () => {
      if (fromKeyboard) schedule();
    };
    document.addEventListener("keydown", onKeyDown, true);
    root.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      root.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("resize", schedule);
    };
  }, [root, follow]);

  return follow;
}
