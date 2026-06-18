import { RefObject, useEffect, useRef } from "react";

// 处于编辑态的节点：contenteditable 才算可编辑，[data-slate-editor] 在 readonly 下也有该属性，不能用作判断
const EDITABLE_SELECTOR =
  '[contenteditable="true"], [contenteditable="plaintext-only"]';

const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  return !!el.closest(EDITABLE_SELECTOR);
};

/**
 * 阻止白板交互（框选/拖拽元素/拖画布）过程中误选富文本、Frame 标题、Image 介绍等 HTML 文字。
 *
 * 思路：在容器上以 capture 监听 selectstart，当"交互中"标志为 true 时 preventDefault。
 * 标志位在 pointerdown 同步置位（不依赖 React 状态，避免时序问题），在 pointerup / blur 清除。
 * pointerdown 落在 contenteditable 内（正在编辑文字）则不置位，保证正常选字。
 */
const usePreventTextSelection = <T extends HTMLElement>(
  containerRef: RefObject<T | null>,
) => {
  const isInteractingRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onSelectStart = (e: Event) => {
      if (!isInteractingRef.current) return;
      e.preventDefault();
    };

    const reset = () => {
      isInteractingRef.current = false;
    };

    container.addEventListener("selectstart", onSelectStart, { capture: true });
    // 鼠标可能拖出白板外松手，故用 document 监听
    document.addEventListener("pointerup", reset);
    document.addEventListener("pointercancel", reset);
    // 兜底：窗口失焦（如切窗口）时也清除，防 pointerup 丢失
    window.addEventListener("blur", reset);

    return () => {
      container.removeEventListener("selectstart", onSelectStart, {
        capture: true,
      });
      document.removeEventListener("pointerup", reset);
      document.removeEventListener("pointercancel", reset);
      window.removeEventListener("blur", reset);
    };
  }, [containerRef]);

  // 供调用方在 pointerdown 同步置位：落在可编辑节点内不置位，保证编辑时正常选字
  const markInteracting = (target: EventTarget | null) => {
    const willInteract = !isEditableTarget(target);
    isInteractingRef.current = willInteract;
    // 点击非编辑区域时主动清除已有 HTML 选区：编辑器 blur 后 Slate 不会自动清 DOM 选区高亮，
    // 而拦截 selectstart 又挡掉了浏览器"点击外部清除旧选区"的原生行为，这里补回。
    if (willInteract) {
      window.getSelection()?.removeAllRanges();
    }
  };

  return { markInteracting };
};

export default usePreventTextSelection;
