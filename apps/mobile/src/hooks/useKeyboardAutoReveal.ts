import { useEffect } from "react";

const AUTO_REVEAL_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const KEYBOARD_OPTOUT_SELECTOR = '[data-kb-optout="true"], .mobile-kb-optout';

function resolveRevealTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const candidate = target.matches(AUTO_REVEAL_SELECTOR)
    ? target
    : target.closest<HTMLElement>(AUTO_REVEAL_SELECTOR);
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
  return candidate;
}

export function useKeyboardAutoReveal(): void {
  useEffect(() => {
    let rafId: number | null = null;

    const handleFocusIn = (event: FocusEvent) => {
      const revealTarget = resolveRevealTarget(event.target);
      if (!revealTarget) {
        return;
      }
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        revealTarget.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "auto",
        });
      });
    };

    document.addEventListener("focusin", handleFocusIn, true);

    return () => {
      document.removeEventListener("focusin", handleFocusIn, true);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);
}
