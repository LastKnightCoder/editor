import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildPanTimeline,
  clampOffset,
  resolveEnabledStates,
  resolvePanLayout,
  resolveReleaseDecision,
  type PanState,
  type PanTimeline,
} from "./panModel";

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
  const enabledStates = useMemo(
    () => resolveEnabledStates(props.enabledStates),
    [props.enabledStates],
  );
  const [viewportHeight, setViewportHeight] = useState(() =>
    Math.max(1, window.innerHeight),
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

  activeStateRef.current = activeState;
  offsetRef.current = offset;
  openRef.current = props.open;

  const commitState = useCallback(
    (nextState: PanState) => {
      const prev = activeStateRef.current;
      if (prev === nextState) return;
      setActiveState(nextState);
      activeStateRef.current = nextState;
      props.onStateChange?.(nextState, prev);
    },
    [props],
  );

  const animateOffset = useCallback((targetOffset: number) => {
    const current = offsetRef.current;
    setTransition(targetOffset > current ? TRANSITION_DOWN : TRANSITION_UP);
    setOffset(targetOffset);
  }, []);

  const animateState = useCallback(
    (state: PanState) => {
      animateOffset(layout.offsets[state]);
      commitState(state);
    },
    [animateOffset, commitState, layout.offsets],
  );

  const closeByGesture = useCallback(() => {
    props.onRequestClose?.();
    animateState(layout.lowestState);
  }, [animateState, layout.lowestState, props]);

  const beginDrag = useCallback((clientY: number, pointerId: number | null) => {
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
  }, []);

  const shouldAllowDrag = useCallback(
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
    [layout.highestState, props.scrollRef],
  );

  const handleDragMove = useCallback(
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
        setTransition("none");
      }

      prevent();
      const dt = Math.max(1, timeStamp - session.latestTs);
      session.velocityY = (clientY - session.latestY) / dt;
      session.latestY = clientY;
      session.latestTs = timeStamp;

      const nextOffset = clampOffset(layout, session.startOffset + deltaY);
      setOffset(nextOffset);
    },
    [layout, shouldAllowDrag],
  );

  const endDrag = useCallback(() => {
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
  }, [
    animateState,
    closeByGesture,
    layout,
    props.closeOnSwipeDownFromLowest,
    props.snapThresholdPx,
    props.snapVelocityPxPerMs,
  ]);

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

  useEffect(() => {
    props.onTimelineChange?.(timeline);
  }, [props, timeline]);

  useEffect(() => {
    const onResize = () => {
      setViewportHeight(Math.max(1, window.innerHeight));
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!props.open) return;
    if (shouldRender) return;
    setShouldRender(true);
    const nextState = pickInitialState(
      props.initialState,
      layout.enabledStates,
    );
    setActiveState(nextState);
    setTransition("none");
    setOffset(layout.viewportHeight);
    const frame = window.requestAnimationFrame(() => {
      setTransition(ENTER_TRANSITION);
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
    shouldRender,
  ]);

  useEffect(() => {
    if (props.open || !shouldRender) return;
    setIsDragging(false);
    setTransition(EXIT_TRANSITION);
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
  }, [layout.viewportHeight, props.open, shouldRender]);

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
    setTransition("none");
    setOffset(layout.offsets[activeStateRef.current]);
  }, [
    animateState,
    isDragging,
    layout.enabledStates,
    layout.offsets,
    props.initialState,
    props.open,
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
    };
  }, []);

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
          transform: `translateY(${offset}px)`,
          transition,
          willChange: "transform",
        }}
        onTouchStart={(event) => {
          if (!openRef.current) return;
          if (event.touches.length !== 1) return;
          beginDrag(event.touches[0].clientY, null);
        }}
        onTouchMove={(event) => {
          if (!openRef.current) return;
          const touch = event.touches[0];
          if (!touch) return;
          handleDragMove(touch.clientY, performance.now(), () => {
            event.preventDefault();
          });
        }}
        onTouchEnd={endDrag}
        onTouchCancel={endDrag}
        onMouseDown={(event) => {
          if (!openRef.current) return;
          if (event.button !== 0) return;
          beginDrag(event.clientY, 1);
          const handleMove = (moveEvent: MouseEvent) => {
            handleDragMove(moveEvent.clientY, performance.now(), () => {
              moveEvent.preventDefault();
            });
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
