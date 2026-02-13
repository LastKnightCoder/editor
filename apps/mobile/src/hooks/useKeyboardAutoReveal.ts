import { useEffect, useRef } from "react";

const AUTO_REVEAL_SELECTOR =
  'input, textarea, select, [contenteditable], [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
const KEYBOARD_OPTOUT_SELECTOR = '[data-kb-optout="true"], .mobile-kb-optout';
const NATIVE_KEYBOARD_EVENT = "tau:native-kb-height";
const REVEAL_RETRY_DELAYS_MS = [0, 120, 260] as const;
const VIEWPORT_SAFE_GAP = 12;
const MAX_SCROLL_STEP_RATIO = 0.9;

type RevealGeometry = {
  rect: DOMRect | null;
  shouldScrollIntoView: boolean;
};

function isContentEditableCandidate(element: HTMLElement): boolean {
  const contenteditable = element.getAttribute("contenteditable");
  if (contenteditable !== null) {
    const normalized = contenteditable.trim().toLowerCase();
    if (normalized === "false") {
      return false;
    }
    return (
      normalized === "" ||
      normalized === "true" ||
      normalized === "plaintext-only"
    );
  }
  return element.isContentEditable;
}

function resolveDeepActiveElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  let current: Element | null = document.activeElement;
  while (current instanceof HTMLElement && current.shadowRoot) {
    const next = current.shadowRoot.activeElement;
    if (!next || next === current) {
      break;
    }
    current = next;
  }
  return current instanceof HTMLElement ? current : null;
}

function isScrollableY(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY || style.overflow;
  return /(auto|scroll|overlay)/.test(overflowY);
}

function findScrollableContainer(target: HTMLElement): HTMLElement | null {
  let parent = target.parentElement;
  while (parent) {
    if (
      isScrollableY(parent) &&
      parent.scrollHeight > parent.clientHeight + 1
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function isFiniteRect(
  rect: Pick<DOMRect, "top" | "bottom" | "left" | "right" | "width" | "height">,
): boolean {
  return (
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.bottom) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height)
  );
}

function hasVisibleRect(
  rect: Pick<DOMRect, "width" | "height"> | null,
): rect is DOMRect {
  return !!rect && (rect.width > 0 || rect.height > 0);
}

function resolveSelectionRectWithin(target: HTMLElement): DOMRect | null {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!target.contains(range.commonAncestorContainer)) {
    return null;
  }

  let caretRange = range;
  if (typeof range.cloneRange === "function") {
    const clonedRange = range.cloneRange();
    if (
      typeof clonedRange.getBoundingClientRect === "function" ||
      typeof clonedRange.getClientRects === "function"
    ) {
      caretRange = clonedRange;
    }
  }

  if (!caretRange.collapsed && typeof caretRange.collapse === "function") {
    caretRange.collapse(false);
  }

  if (typeof caretRange.getBoundingClientRect === "function") {
    const caretRect = caretRange.getBoundingClientRect();
    if (isFiniteRect(caretRect) && hasVisibleRect(caretRect)) {
      return caretRect;
    }
  }

  if (typeof caretRange.getClientRects === "function") {
    const rects = Array.from(caretRange.getClientRects());
    for (const rect of rects) {
      if (isFiniteRect(rect) && hasVisibleRect(rect)) {
        return rect;
      }
    }
  }

  return null;
}

function resolveRevealGeometry(target: HTMLElement): RevealGeometry {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return {
      rect: target.getBoundingClientRect(),
      shouldScrollIntoView: true,
    };
  }

  if (isContentEditableCandidate(target)) {
    return {
      rect: resolveSelectionRectWithin(target),
      shouldScrollIntoView: false,
    };
  }

  return {
    rect: target.getBoundingClientRect(),
    shouldScrollIntoView: true,
  };
}

function ensureTargetVisible(target: HTMLElement, rect: DOMRect | null): void {
  if (!hasVisibleRect(rect) || !isFiniteRect(rect)) {
    return;
  }
  const visualViewport = window.visualViewport;
  const viewportTop = Math.round(visualViewport?.offsetTop ?? 0);
  const viewportHeight = Math.round(
    visualViewport?.height ?? window.innerHeight,
  );
  const viewportBottom = viewportTop + viewportHeight;
  const safeTop = viewportTop + VIEWPORT_SAFE_GAP;
  const safeBottom = viewportBottom - VIEWPORT_SAFE_GAP;

  let deltaY = 0;
  if (rect.bottom > safeBottom) {
    deltaY = rect.bottom - safeBottom;
  } else if (rect.top < safeTop) {
    deltaY = rect.top - safeTop;
  }

  if (Math.abs(deltaY) < 1) {
    return;
  }

  const maxStep = Math.max(120, viewportHeight * MAX_SCROLL_STEP_RATIO);
  if (Math.abs(deltaY) > maxStep) {
    deltaY = Math.sign(deltaY) * maxStep;
  }

  const scrollContainer = findScrollableContainer(target);
  if (scrollContainer) {
    scrollContainer.scrollTop += deltaY;
    return;
  }

  if (typeof window.scrollBy === "function") {
    try {
      window.scrollBy({ top: deltaY, left: 0, behavior: "auto" });
    } catch {
      // 某些运行时不支持对象参数，降级到数值调用
      window.scrollBy(0, deltaY);
    }
  }
}

function resolveRevealTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const candidate =
    (target.matches(AUTO_REVEAL_SELECTOR) ? target : null) ??
    target.closest<HTMLElement>(AUTO_REVEAL_SELECTOR) ??
    (isContentEditableCandidate(target)
      ? target
      : target.closest<HTMLElement>("[contenteditable]"));
  if (!candidate) {
    return null;
  }
  if (candidate.closest(KEYBOARD_OPTOUT_SELECTOR)) {
    return null;
  }
  if (
    candidate instanceof HTMLInputElement ||
    candidate instanceof HTMLTextAreaElement
  ) {
    if (candidate.disabled || candidate.readOnly) {
      return null;
    }
  }
  if (candidate instanceof HTMLSelectElement && candidate.disabled) {
    return null;
  }
  if (
    !(candidate instanceof HTMLInputElement) &&
    !(candidate instanceof HTMLTextAreaElement) &&
    !(candidate instanceof HTMLSelectElement) &&
    !isContentEditableCandidate(candidate)
  ) {
    return null;
  }
  return candidate;
}

export function useKeyboardAutoReveal(): void {
  const focusedTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let rafId: number | null = null;
    let timers: number[] = [];

    const clearPending = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      timers = [];
    };

    const revealTargetNow = (target: HTMLElement) => {
      const geometry = resolveRevealGeometry(target);
      if (geometry.shouldScrollIntoView) {
        target.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "auto",
        });
      }
      ensureTargetVisible(target, geometry.rect);
    };

    const scheduleReveal = (
      target: HTMLElement,
      delays: readonly number[] = REVEAL_RETRY_DELAYS_MS,
    ) => {
      clearPending();
      for (const delay of delays) {
        const timer = window.setTimeout(() => {
          if (!document.contains(target)) {
            return;
          }
          rafId = window.requestAnimationFrame(() => {
            rafId = null;
            revealTargetNow(target);
          });
        }, delay);
        timers.push(timer);
      }
    };

    const refreshFocusedTarget = (): HTMLElement | null => {
      const active = resolveRevealTarget(resolveDeepActiveElement());
      focusedTargetRef.current = active;
      return active;
    };

    const handleFocusIn = (event: FocusEvent) => {
      const revealTarget = resolveRevealTarget(event.target);
      if (!revealTarget) {
        return;
      }
      focusedTargetRef.current = revealTarget;
      scheduleReveal(revealTarget);
    };

    const handleFocusOut = () => {
      window.requestAnimationFrame(() => {
        refreshFocusedTarget();
      });
    };

    const handleViewportOrKeyboardChange = () => {
      const target = focusedTargetRef.current ?? refreshFocusedTarget();
      if (!target) {
        return;
      }
      scheduleReveal(target, [0, 120]);
    };

    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    window.addEventListener(
      NATIVE_KEYBOARD_EVENT,
      handleViewportOrKeyboardChange,
    );
    window.visualViewport?.addEventListener(
      "resize",
      handleViewportOrKeyboardChange,
    );
    window.visualViewport?.addEventListener(
      "scroll",
      handleViewportOrKeyboardChange,
    );

    return () => {
      focusedTargetRef.current = null;
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      window.removeEventListener(
        NATIVE_KEYBOARD_EVENT,
        handleViewportOrKeyboardChange,
      );
      window.visualViewport?.removeEventListener(
        "resize",
        handleViewportOrKeyboardChange,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        handleViewportOrKeyboardChange,
      );
      clearPending();
    };
  }, []);
}
