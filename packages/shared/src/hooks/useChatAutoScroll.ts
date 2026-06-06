import { useEffect, useRef, type RefCallback, type RefObject } from "react";
import { useMemoizedFn } from "ahooks";

export interface UseChatAutoScrollOptions<T extends HTMLElement> {
  containerRef?: RefObject<T | null>;
  enabled?: boolean;
  bottomThreshold?: number;
}

export interface ScrollToBottomOptions {
  force?: boolean;
}

export interface UseChatAutoScrollResult<T extends HTMLElement> {
  containerRef: RefCallback<T>;
  enableAutoScroll: () => void;
  forceScrollToBottom: () => boolean;
  isScrolledToBottom: () => boolean;
  scrollToBottom: (options?: ScrollToBottomOptions) => boolean;
  setAutoScrollEnabled: (
    nextEnabled: boolean,
    options?: { userSuspended?: boolean },
  ) => void;
}

export function useChatAutoScroll<T extends HTMLElement>({
  containerRef: externalContainerRef,
  enabled = true,
  bottomThreshold = 10,
}: UseChatAutoScrollOptions<T>): UseChatAutoScrollResult<T> {
  const currentContainerRef = useRef<T | null>(null);
  const isAutoScrollEnabledRef = useRef(true);
  const isAutoScrollSuspendedByUserRef = useRef(false);
  const lastUserScrollDirectionRef = useRef<"up" | "down" | null>(null);
  const lastTouchYRef = useRef<number | null>(null);
  const attachedContainerRef = useRef<T | null>(null);
  const detachListenersRef = useRef<(() => void) | null>(null);

  const isScrolledToBottom = useMemoizedFn(() => {
    const container = currentContainerRef.current;
    if (!container) return true;

    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollTop + clientHeight >= scrollHeight - bottomThreshold;
  });

  const setAutoScrollEnabled = useMemoizedFn(
    (nextEnabled: boolean, options?: { userSuspended?: boolean }) => {
      isAutoScrollEnabledRef.current = nextEnabled;
      if (nextEnabled) {
        isAutoScrollSuspendedByUserRef.current = false;
        lastUserScrollDirectionRef.current = null;
        return;
      }
      if (options?.userSuspended) {
        isAutoScrollSuspendedByUserRef.current = true;
      }
    },
  );

  const enableAutoScroll = useMemoizedFn(() => {
    setAutoScrollEnabled(true);
  });

  const scrollToBottom = useMemoizedFn((options?: ScrollToBottomOptions) => {
    const container = currentContainerRef.current;
    if (!container) {
      return false;
    }

    if (!options?.force && !isAutoScrollEnabledRef.current) {
      return false;
    }

    container.scrollTop = container.scrollHeight;
    return true;
  });

  const forceScrollToBottom = useMemoizedFn(() => {
    enableAutoScroll();
    return scrollToBottom({ force: true });
  });

  const handleScroll = useMemoizedFn(() => {
    const isAtBottom = isScrolledToBottom();
    if (!isAtBottom) {
      setAutoScrollEnabled(false);
      return;
    }

    if (
      !isAutoScrollSuspendedByUserRef.current ||
      lastUserScrollDirectionRef.current === "down"
    ) {
      setAutoScrollEnabled(true);
    }
  });

  const handleWheel = useMemoizedFn((event: WheelEvent) => {
    if (event.deltaY < 0) {
      lastUserScrollDirectionRef.current = "up";
      setAutoScrollEnabled(false, { userSuspended: true });
      return;
    }

    if (event.deltaY > 0) {
      lastUserScrollDirectionRef.current = "down";
      window.requestAnimationFrame(() => {
        if (isScrolledToBottom()) {
          setAutoScrollEnabled(true);
        }
      });
    }
  });

  const handleTouchStart = useMemoizedFn((event: TouchEvent) => {
    lastTouchYRef.current = event.touches[0]?.clientY ?? null;
  });

  const handleTouchMove = useMemoizedFn((event: TouchEvent) => {
    const currentY = event.touches[0]?.clientY;
    const lastY = lastTouchYRef.current;
    if (typeof currentY !== "number" || typeof lastY !== "number") {
      return;
    }

    if (currentY > lastY) {
      lastUserScrollDirectionRef.current = "up";
      setAutoScrollEnabled(false, { userSuspended: true });
    } else if (currentY < lastY) {
      lastUserScrollDirectionRef.current = "down";
      window.requestAnimationFrame(() => {
        if (isScrolledToBottom()) {
          setAutoScrollEnabled(true);
        }
      });
    }
    lastTouchYRef.current = currentY;
  });

  const detachListeners = useMemoizedFn(() => {
    detachListenersRef.current?.();
    detachListenersRef.current = null;
    attachedContainerRef.current = null;
  });

  const attachListeners = useMemoizedFn(() => {
    if (!enabled) {
      detachListeners();
      return;
    }

    const container = currentContainerRef.current;
    if (!container) {
      return;
    }

    if (attachedContainerRef.current === container) {
      return;
    }

    detachListeners();
    attachedContainerRef.current = container;
    container.addEventListener("scroll", handleScroll);
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: true,
    });
    detachListenersRef.current = () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  });

  const setContainerRef = useMemoizedFn((container: T | null) => {
    if (externalContainerRef) {
      (externalContainerRef as { current: T | null }).current = container;
    }

    if (currentContainerRef.current === container) {
      return;
    }

    detachListeners();
    currentContainerRef.current = container;
    attachListeners();
  });

  useEffect(() => {
    if (enabled) {
      attachListeners();
      return;
    }
    detachListeners();
  }, [attachListeners, detachListeners, enabled]);

  useEffect(
    () => () => {
      detachListeners();
    },
    [detachListeners],
  );

  return {
    containerRef: setContainerRef,
    enableAutoScroll,
    forceScrollToBottom,
    isScrolledToBottom,
    scrollToBottom,
    setAutoScrollEnabled,
  };
}

export default useChatAutoScroll;
