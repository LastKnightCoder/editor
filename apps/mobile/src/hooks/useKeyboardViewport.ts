import { useEffect, useState } from "react";

export type KeyboardViewportState = {
  viewportHeight: number;
  keyboardHeight: number;
  isKeyboardVisible: boolean;
};

const SCALE_EPSILON = 0.001;

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
  const visualViewport = window.visualViewport;

  if (!visualViewport) {
    return {
      viewportHeight: layoutViewportHeight,
      keyboardHeight: 0,
      isKeyboardVisible: false,
    };
  }

  const scale =
    typeof visualViewport.scale === "number" ? visualViewport.scale : 1;
  const isScaled = Math.abs(scale - 1) > SCALE_EPSILON;
  const keyboardHeight = isScaled
    ? previous.keyboardHeight
    : Math.max(
        0,
        Math.round(
          layoutViewportHeight -
            visualViewport.height -
            visualViewport.offsetTop,
        ),
      );

  const viewportHeight = Math.max(
    1,
    Math.round(layoutViewportHeight - keyboardHeight),
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
    visualViewport?.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("scroll", scheduleUpdate);

    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      document.removeEventListener("focusin", scheduleUpdate, true);
      document.removeEventListener("focusout", scheduleUpdate, true);
      visualViewport?.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("scroll", scheduleUpdate);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return state;
}
