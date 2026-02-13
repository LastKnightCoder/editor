import { useEffect, useState } from "react";

export type KeyboardViewportState = {
  viewportHeight: number;
  keyboardHeight: number;
  isKeyboardVisible: boolean;
};

const SCALE_EPSILON = 0.001;
const NATIVE_KEYBOARD_EVENT = "tau:native-kb-height";

type WindowWithNativeKeyboard = Window & {
  __TAU_NATIVE_KB_HEIGHT?: unknown;
  __TAU_NATIVE_KB_HEIGHT_RAW?: unknown;
};

function resolveDeepActiveElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  let activeElement: Element | null = document.activeElement;
  while (activeElement instanceof HTMLElement && activeElement.shadowRoot) {
    const nextActive = activeElement.shadowRoot.activeElement;
    if (!nextActive || nextActive === activeElement) {
      break;
    }
    activeElement = nextActive;
  }
  return activeElement instanceof HTMLElement ? activeElement : null;
}

function isKeyboardFocusableElement(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) {
    return !element.disabled && !element.readOnly && element.type !== "hidden";
  }
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }
  if (element instanceof HTMLSelectElement) {
    return !element.disabled;
  }
  return element.isContentEditable;
}

function hasKeyboardEditableFocus(): boolean {
  const activeElement = resolveDeepActiveElement();
  if (!activeElement) {
    return false;
  }
  return isKeyboardFocusableElement(activeElement);
}

function readNativeKeyboardHeight(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = (window as WindowWithNativeKeyboard).__TAU_NATIVE_KB_HEIGHT;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value));
}

function getLayoutViewportHeight(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  return Math.max(
    1,
    Math.round(
      window.innerHeight || document.documentElement.clientHeight || 1,
    ),
  );
}

function toKeyboardViewportState(
  previous: KeyboardViewportState,
): KeyboardViewportState {
  const layoutViewportHeight = getLayoutViewportHeight();
  const nativeKeyboardHeight = readNativeKeyboardHeight();
  const normalizedNativeKeyboardHeight =
    nativeKeyboardHeight === null
      ? null
      : Math.max(0, Math.min(layoutViewportHeight, nativeKeyboardHeight));
  const visualViewport = window.visualViewport;

  if (!visualViewport) {
    const keyboardHeight = normalizedNativeKeyboardHeight ?? 0;
    return {
      viewportHeight: Math.max(1, layoutViewportHeight - keyboardHeight),
      keyboardHeight,
      isKeyboardVisible: keyboardHeight > 0,
    };
  }

  const scale =
    typeof visualViewport.scale === "number" ? visualViewport.scale : 1;
  const isScaled = Math.abs(scale - 1) > SCALE_EPSILON;
  const previousBaseHeight = Math.max(
    1,
    Math.round(previous.viewportHeight + previous.keyboardHeight),
  );
  const viewportBottom = Math.max(
    0,
    Math.round(visualViewport.height + visualViewport.offsetTop),
  );
  let baseHeight = Math.max(layoutViewportHeight, previousBaseHeight);

  if (!isScaled) {
    const editableFocused = hasKeyboardEditableFocus();
    if (!editableFocused && viewportBottom >= layoutViewportHeight) {
      baseHeight = layoutViewportHeight;
    }
  }

  const keyboardHeightByViewport = isScaled
    ? previous.keyboardHeight
    : Math.max(0, Math.round(baseHeight - viewportBottom));
  const keyboardHeight =
    normalizedNativeKeyboardHeight ??
    Math.max(0, Math.round(keyboardHeightByViewport));
  const viewportBaseHeight =
    normalizedNativeKeyboardHeight === null ? baseHeight : layoutViewportHeight;

  const viewportHeight = Math.max(
    1,
    Math.round(viewportBaseHeight - keyboardHeight),
  );

  return {
    viewportHeight,
    keyboardHeight,
    isKeyboardVisible: keyboardHeight > 0,
  };
}

function isSameState(
  left: KeyboardViewportState,
  right: KeyboardViewportState,
): boolean {
  return (
    left.viewportHeight === right.viewportHeight &&
    left.keyboardHeight === right.keyboardHeight &&
    left.isKeyboardVisible === right.isKeyboardVisible
  );
}

const INITIAL_STATE: KeyboardViewportState = {
  viewportHeight: getLayoutViewportHeight(),
  keyboardHeight: 0,
  isKeyboardVisible: false,
};

export function useKeyboardViewportState(): KeyboardViewportState {
  const [state, setState] = useState<KeyboardViewportState>(() =>
    toKeyboardViewportState(INITIAL_STATE),
  );

  useEffect(() => {
    let rafId: number | null = null;

    const update = () => {
      setState((previous) => {
        const next = toKeyboardViewportState(previous);
        return isSameState(previous, next) ? previous : next;
      });
    };

    const scheduleUpdate = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    };

    const visualViewport = window.visualViewport;
    scheduleUpdate();

    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("orientationchange", scheduleUpdate, {
      passive: true,
    });
    document.addEventListener("focusin", scheduleUpdate, true);
    document.addEventListener("focusout", scheduleUpdate, true);
    window.addEventListener(
      NATIVE_KEYBOARD_EVENT,
      scheduleUpdate as EventListener,
    );
    visualViewport?.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("scroll", scheduleUpdate);

    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      document.removeEventListener("focusin", scheduleUpdate, true);
      document.removeEventListener("focusout", scheduleUpdate, true);
      window.removeEventListener(
        NATIVE_KEYBOARD_EVENT,
        scheduleUpdate as EventListener,
      );
      visualViewport?.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("scroll", scheduleUpdate);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return state;
}
