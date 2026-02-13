import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMemoizedFn } from "ahooks";
import {
  buildPanTimeline,
  clampOffset,
  resolveEnabledStates,
  resolvePanLayout,
  resolveReleaseDecision,
  type PanState,
  type PanTimeline,
} from "./panModel";
import { useKeyboardViewport } from "./KeyboardViewportProvider";

type DragSession = {
  active: boolean;
  pointerId: number | null;
  startY: number;
  startOffset: number;
  startState: PanState;
  latestY: number;
  latestTs: number;
  velocityY: number;
  dragging: boolean;
};

export type PanContainerProps = {
  open: boolean;
  initialState?: PanState;
  enabledStates?: PanState[];
  heights?: Partial<{ mini: number; normal: number }>;
  snapThresholdPx?: number;
  snapVelocityPxPerMs?: number;
  closeOnSwipeDownFromLowest?: boolean;
  onRequestClose?: () => void;
  onStateChange?: (next: PanState, prev: PanState) => void;
  onTimelineChange?: (timeline: PanTimeline) => void;
  className?: string;
  maskClassName?: string;
  containerClassName?: string;
  scrollRef?: React.RefObject<HTMLElement | null>;
  children: ReactNode | ((timeline: PanTimeline) => ReactNode);
};

const ENTER_TRANSITION = "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)";
const EXIT_TRANSITION = "transform 250ms ease-in";
const TRANSITION_UP = "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)";
const TRANSITION_DOWN = "transform 250ms ease-in";

const TOUCHMOVE_ALLOW_SELECTOR = '[data-allow-touchmove="true"]';
const PAN_DRAG_ALWAYS_IGNORE_SELECTOR =
  'input, textarea, select, [data-pan-ignore-drag="true"]';

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function canAllowTouchMove(
  target: EventTarget | null,
  panel: HTMLElement | null,
): boolean {
  if (!(target instanceof Node)) return true;
  if (panel?.contains(target)) return true;
  return target instanceof Element && target.closest(TOUCHMOVE_ALLOW_SELECTOR)
    ? true
    : false;
}

function shouldIgnorePanDragStart(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(PAN_DRAG_ALWAYS_IGNORE_SELECTOR)) {
    return true;
  }

  const editable = target.closest<HTMLElement>("[contenteditable]");
  if (!editable) {
    return false;
  }

  const contenteditable = editable.getAttribute("contenteditable");
  const normalized = contenteditable?.trim().toLowerCase();
  const isEditable =
    normalized === "" ||
    normalized === "true" ||
    normalized === "plaintext-only";
  if (!isEditable) {
    return false;
  }

  const activeElement = document.activeElement;
  return !!activeElement && editable.contains(activeElement);
}

function pickInitialState(
  initialState: PanState | undefined,
  enabledStates: PanState[],
): PanState {
  if (initialState && enabledStates.includes(initialState)) {
    return initialState;
  }
  return enabledStates[0];
}

export function PanContainer(props: PanContainerProps) {
  const keyboardViewport = useKeyboardViewport();
  const enabledStates = useMemo(
    () => resolveEnabledStates(props.enabledStates),
    [props.enabledStates],
  );
  const viewportHeight = Math.max(
    1,
    keyboardViewport.viewportHeight || window.innerHeight || 1,
  );
  const layout = useMemo(
    () =>
      resolvePanLayout({
        viewportHeight,
        enabledStates,
        heights: props.heights,
      }),
    [enabledStates, props.heights, viewportHeight],
  );

  const [shouldRender, setShouldRender] = useState(props.open);
  const [activeState, setActiveState] = useState<PanState>(() =>
    pickInitialState(props.initialState, layout.enabledStates),
  );
  const [offset, setOffset] = useState(layout.viewportHeight);
  const [isDragging, setIsDragging] = useState(false);
  const [transition, setTransition] = useState("none");

  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragSession>({
    active: false,
    pointerId: null,
    startY: 0,
    startOffset: 0,
    startState: activeState,
    latestY: 0,
    latestTs: 0,
    velocityY: 0,
    dragging: false,
  });
  const activeStateRef = useRef(activeState);
  const offsetRef = useRef(offset);
  const openRef = useRef(props.open);
  const closeTimerRef = useRef<number | null>(null);
  const offsetRafRef = useRef<number | null>(null);
  const pendingOffsetRef = useRef<number | null>(null);
  const touchCleanupRef = useRef<(() => void) | null>(null);

  activeStateRef.current = activeState;
  offsetRef.current = offset;
  openRef.current = props.open;

  const commitState = useMemoizedFn((nextState: PanState) => {
    const prev = activeStateRef.current;
    if (prev === nextState) return;
    setActiveState(nextState);
    activeStateRef.current = nextState;
    props.onStateChange?.(nextState, prev);
  });

  const setTransitionMode = useMemoizedFn((nextTransition: string) => {
    if (panelRef.current) {
      panelRef.current.style.transition = nextTransition;
    }
    setTransition(nextTransition);
  });

  const animateOffset = useMemoizedFn((targetOffset: number) => {
    const current = offsetRef.current;
    setTransitionMode(targetOffset > current ? TRANSITION_DOWN : TRANSITION_UP);
    setOffset(targetOffset);
  });

  const setOffsetRaf = useMemoizedFn((nextOffset: number) => {
    pendingOffsetRef.current = nextOffset;
    if (offsetRafRef.current !== null) return;
    offsetRafRef.current = window.requestAnimationFrame(() => {
      offsetRafRef.current = null;
      const pending = pendingOffsetRef.current;
      if (pending === null) return;
      pendingOffsetRef.current = null;
      setOffset(pending);
    });
  });

  const clearTouchListeners = useMemoizedFn(() => {
    if (!touchCleanupRef.current) return;
    touchCleanupRef.current();
    touchCleanupRef.current = null;
  });

  const animateState = useMemoizedFn((state: PanState) => {
    animateOffset(layout.offsets[state]);
    commitState(state);
  });

  const closeByGesture = useMemoizedFn(() => {
    props.onRequestClose?.();
    animateState(layout.lowestState);
  });

  const beginDrag = useMemoizedFn(
    (clientY: number, pointerId: number | null) => {
      setTransitionMode("none");
      dragRef.current = {
        active: true,
        pointerId,
        startY: clientY,
        startOffset: offsetRef.current,
        startState: activeStateRef.current,
        latestY: clientY,
        latestTs: performance.now(),
        velocityY: 0,
        dragging: false,
      };
    },
  );

  const shouldAllowDrag = useMemoizedFn(
    (deltaY: number, startState: PanState): boolean => {
      if (deltaY === 0) return false;
      const highestState = layout.highestState;
      if (deltaY < 0) {
        return startState !== highestState;
      }
      if (startState !== highestState) {
        return true;
      }
      const scrollTop = props.scrollRef?.current?.scrollTop ?? 0;
      return scrollTop <= 0;
    },
  );

  const handleDragMove = useMemoizedFn(
    (clientY: number, timeStamp: number, prevent: () => void) => {
      const session = dragRef.current;
      if (!session.active) return;

      const deltaY = clientY - session.startY;
      if (!session.dragging) {
        if (!shouldAllowDrag(deltaY, session.startState)) {
          session.latestY = clientY;
          session.latestTs = timeStamp;
          return;
        }
        session.dragging = true;
        setIsDragging(true);
        setTransitionMode("none");
      }

      prevent();
      const dt = Math.max(1, timeStamp - session.latestTs);
      session.velocityY = (clientY - session.latestY) / dt;
      session.latestY = clientY;
      session.latestTs = timeStamp;

      const nextOffset = clampOffset(layout, session.startOffset + deltaY);
      setOffsetRaf(nextOffset);
    },
  );

  const endDrag = useMemoizedFn(() => {
    clearTouchListeners();
    const session = dragRef.current;
    if (!session.active) return;
    dragRef.current.active = false;

    if (!session.dragging) {
      setIsDragging(false);
      return;
    }

    setIsDragging(false);
    const decision = resolveReleaseDecision({
      layout,
      startState: session.startState,
      offset: offsetRef.current,
      deltaY: session.latestY - session.startY,
      velocityY: session.velocityY,
      thresholdPx: props.snapThresholdPx ?? 56,
      velocityThreshold: props.snapVelocityPxPerMs ?? 0.35,
      closeOnSwipeDownFromLowest: props.closeOnSwipeDownFromLowest ?? true,
    });

    if (decision.shouldClose) {
      closeByGesture();
      return;
    }

    animateState(decision.nextState);
  });

  const timeline = useMemo(
    () =>
      buildPanTimeline({
        layout,
        offset,
        state: activeState,
        isDragging,
      }),
    [activeState, isDragging, layout, offset],
  );

  const emitTimelineChange = useMemoizedFn((nextTimeline: PanTimeline) => {
    props.onTimelineChange?.(nextTimeline);
  });

  useEffect(() => {
    emitTimelineChange(timeline);
  }, [timeline]);

  useEffect(() => {
    if (!props.open) return;
    if (shouldRender) return;
    setShouldRender(true);
    const nextState = pickInitialState(
      props.initialState,
      layout.enabledStates,
    );
    setActiveState(nextState);
    setTransitionMode("none");
    setOffset(layout.viewportHeight);
    const frame = window.requestAnimationFrame(() => {
      setTransitionMode(ENTER_TRANSITION);
      setOffset(layout.offsets[nextState]);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    layout.enabledStates,
    layout.offsets,
    layout.viewportHeight,
    props.initialState,
    props.open,
    setTransitionMode,
    shouldRender,
  ]);

  useEffect(() => {
    if (props.open || !shouldRender) return;
    setIsDragging(false);
    setTransitionMode(EXIT_TRANSITION);
    setOffset(layout.viewportHeight);
    closeTimerRef.current = window.setTimeout(() => {
      setShouldRender(false);
    }, 250);
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [layout.viewportHeight, props.open, setTransitionMode, shouldRender]);

  useEffect(() => {
    if (!props.open || !shouldRender || isDragging) return;
    const nextState = pickInitialState(
      props.initialState,
      layout.enabledStates,
    );
    if (nextState !== activeStateRef.current) {
      animateState(nextState);
      return;
    }
    setTransitionMode("none");
    setOffset(layout.offsets[activeStateRef.current]);
  }, [
    animateState,
    isDragging,
    layout.enabledStates,
    layout.offsets,
    props.initialState,
    props.open,
    setTransitionMode,
    shouldRender,
  ]);

  useEffect(() => {
    if (!shouldRender) return;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const prevBodyOverflow = bodyStyle.overflow;
    const prevBodyOverscroll = bodyStyle.overscrollBehavior;
    const prevHtmlOverflow = htmlStyle.overflow;
    const prevHtmlOverscroll = htmlStyle.overscrollBehavior;

    bodyStyle.overflow = "hidden";
    bodyStyle.overscrollBehavior = "none";
    htmlStyle.overflow = "hidden";
    htmlStyle.overscrollBehavior = "none";

    const preventBackgroundTouchMove = (event: TouchEvent) => {
      if (canAllowTouchMove(event.target, panelRef.current)) return;
      event.preventDefault();
    };

    document.addEventListener("touchmove", preventBackgroundTouchMove, {
      passive: false,
    });

    return () => {
      document.removeEventListener("touchmove", preventBackgroundTouchMove);
      bodyStyle.overflow = prevBodyOverflow;
      bodyStyle.overscrollBehavior = prevBodyOverscroll;
      htmlStyle.overflow = prevHtmlOverflow;
      htmlStyle.overscrollBehavior = prevHtmlOverscroll;
    };
  }, [shouldRender]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (offsetRafRef.current !== null) {
        window.cancelAnimationFrame(offsetRafRef.current);
      }
      clearTouchListeners();
    };
  }, [clearTouchListeners]);

  const timelineCssVars: CSSProperties = {
    "--pan-progress-overall": timeline.overallProgress,
    "--pan-progress-mini-normal": timeline.segmentProgress.miniToNormal,
    "--pan-progress-normal-full": timeline.segmentProgress.normalToFull,
    "--pan-occluded-bottom": `${Math.max(0, Math.round(offset))}px`,
  } as CSSProperties;

  const renderChildren =
    typeof props.children === "function"
      ? props.children(timeline)
      : props.children;

  if (!shouldRender) {
    return null;
  }

  return (
    <div className={cn("fixed inset-0 z-50", props.className)}>
      <button
        type="button"
        aria-label="关闭面板"
        className={cn(
          "absolute inset-0 bg-black/50 dark:bg-black/70",
          props.open ? "mask-enter" : "mask-exit",
          props.maskClassName,
        )}
        onClick={props.onRequestClose}
      />
      <section
        ref={panelRef}
        className={cn(
          "absolute inset-x-0 top-0 bottom-0 flex flex-col bg-white dark:bg-neutral-950",
          activeState === "full" && !isDragging
            ? "rounded-none"
            : "rounded-t-2xl",
          isDragging && "select-none",
          props.containerClassName,
        )}
        style={{
          ...timelineCssVars,
          transform: `translate3d(0, ${offset}px, 0)`,
          transition,
          willChange: "transform",
        }}
        data-pan-state={activeState}
        onTouchStart={(event) => {
          if (!openRef.current) return;
          if (event.touches.length !== 1) return;
          if (shouldIgnorePanDragStart(event.target)) return;
          clearTouchListeners();

          const touch = event.touches[0];
          const touchId = touch.identifier;
          beginDrag(touch.clientY, touchId);

          const handleTouchMove = (moveEvent: TouchEvent) => {
            const activeTouch = Array.from(moveEvent.touches).find(
              (item) => item.identifier === touchId,
            );
            if (!activeTouch) return;
            handleDragMove(
              activeTouch.clientY,
              moveEvent.timeStamp || performance.now(),
              () => {
                moveEvent.preventDefault();
              },
            );
          };

          const finishTouch = (endEvent: TouchEvent) => {
            const stillActive = Array.from(endEvent.touches).some(
              (item) => item.identifier === touchId,
            );
            if (stillActive) return;
            clearTouchListeners();
            endDrag();
          };

          const cleanup = () => {
            document.removeEventListener("touchmove", handleTouchMove);
            document.removeEventListener("touchend", finishTouch);
            document.removeEventListener("touchcancel", finishTouch);
          };
          touchCleanupRef.current = cleanup;

          document.addEventListener("touchmove", handleTouchMove, {
            passive: false,
          });
          document.addEventListener("touchend", finishTouch);
          document.addEventListener("touchcancel", finishTouch);
        }}
        onTouchEnd={() => {
          clearTouchListeners();
          endDrag();
        }}
        onTouchCancel={() => {
          clearTouchListeners();
          endDrag();
        }}
        onTransitionEnd={(event) => {
          if (event.propertyName !== "transform") return;
          if (!openRef.current || isDragging) return;
          if (transition === "none") return;
          setTransitionMode("none");
        }}
        onMouseDown={(event) => {
          if (!openRef.current) return;
          if (event.button !== 0) return;
          if (shouldIgnorePanDragStart(event.target)) return;
          beginDrag(event.clientY, 1);
          const handleMove = (moveEvent: MouseEvent) => {
            handleDragMove(
              moveEvent.clientY,
              moveEvent.timeStamp || performance.now(),
              () => {
                moveEvent.preventDefault();
              },
            );
          };
          const handleUp = () => {
            document.removeEventListener("mousemove", handleMove);
            document.removeEventListener("mouseup", handleUp);
            endDrag();
          };
          document.addEventListener("mousemove", handleMove);
          document.addEventListener("mouseup", handleUp);
        }}
      >
        {renderChildren}
      </section>
    </div>
  );
}

export default PanContainer;
