import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type ItemRect = { top: number; height: number };

export type PointerReorderOptions = {
  /** 滚动容器；传函数时在拖拽各时刻取值（宿主以 ref 持有容器时用） */
  scrollContainer: HTMLElement | null | (() => HTMLElement | null);
  /** 各项相对滚动容器内容坐标的位置（与 scrollTop 无关） */
  getItemRects: () => ItemRect[];
  /** to 为移除被拖项后的插入位 */
  onDrop: (from: number, to: number) => void;
  /** 可视区上下边缘触发自动滚动的距离（px） */
  edgeZone?: number;
  /** 自动滚动的最大速度（px / 帧） */
  maxSpeed?: number;
};

export type PointerReorderDragging = { from: number; to: number; offsetY: number };

/** 开始拖拽时的指针信息；target 用于指针捕获 */
export type PointerReorderStart = {
  clientY: number;
  pointerId: number;
  target: Element | null;
};

export type PointerReorder = {
  dragging: PointerReorderDragging | null;
  /** 在按下事件中直接开始拖拽（阻止默认行为并捕获 currentTarget） */
  startDrag: (index: number, event: ReactPointerEvent) => void;
  /** 按已记录的指针信息开始拖拽（如长按定时器触发时） */
  startDragAt: (index: number, start: PointerReorderStart) => void;
  /** 取消进行中的拖拽，不回调 onDrop */
  cancelDrag: () => void;
};

type DragSession = {
  pointerId: number;
  from: number;
  rects: ItemRect[];
  startClientY: number;
  startScrollTop: number;
  lastClientY: number;
  to: number;
  offsetY: number;
  frame: number | null;
  speed: number;
  cleanup: () => void;
};

/** 被拖项中心点越过的其他项中线数 = 移除被拖项后的插入位 */
export function resolveDropIndex(
  rects: readonly ItemRect[],
  from: number,
  offsetY: number
): number {
  const dragged = rects[from];
  if (!dragged) return from;
  const center = dragged.top + dragged.height / 2 + offsetY;
  let to = 0;
  rects.forEach((rect, index) => {
    if (index !== from && rect.top + rect.height / 2 < center) to += 1;
  });
  return to;
}

/** 指针深入边缘区的比例换算为滚动速度：上负下正，区外为 0 */
export function resolveAutoScrollSpeed(
  clientY: number,
  viewport: { top: number; bottom: number },
  edgeZone: number,
  maxSpeed: number
): number {
  if (edgeZone <= 0) return 0;
  const topDepth = viewport.top + edgeZone - clientY;
  if (topDepth > 0) return -maxSpeed * Math.min(1, topDepth / edgeZone);
  const bottomDepth = clientY - (viewport.bottom - edgeZone);
  if (bottomDepth > 0) return maxSpeed * Math.min(1, bottomDepth / edgeZone);
  return 0;
}

function resolveScrollContainer(
  scrollContainer: PointerReorderOptions["scrollContainer"]
): HTMLElement | null {
  return typeof scrollContainer === "function" ? scrollContainer() : scrollContainer;
}

/**
 * 与渲染无关的指针拖拽重排：按下把手开始，位移计入滚动增量，
 * 指针进入滚动容器上下边缘区时按 rAF 自动滚动，松手时 from !== to 才回调 onDrop。
 */
export function usePointerReorder(options: PointerReorderOptions): PointerReorder {
  const [dragging, setDragging] = useState<PointerReorderDragging | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const sessionRef = useRef<DragSession | null>(null);

  const update = useCallback((session: DragSession) => {
    const container = resolveScrollContainer(optionsRef.current.scrollContainer);
    const scrollDelta = (container?.scrollTop ?? 0) - session.startScrollTop;
    session.offsetY = session.lastClientY - session.startClientY + scrollDelta;
    session.to = resolveDropIndex(session.rects, session.from, session.offsetY);
    setDragging({ from: session.from, to: session.to, offsetY: session.offsetY });
  }, []);

  const runAutoScroll = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.frame = null;
    const container = resolveScrollContainer(optionsRef.current.scrollContainer);
    if (!container || session.speed === 0) return;
    const before = container.scrollTop;
    container.scrollTop = before + session.speed;
    if (container.scrollTop !== before) update(session);
    session.frame = requestAnimationFrame(runAutoScroll);
  }, [update]);

  const syncAutoScroll = useCallback(
    (session: DragSession) => {
      const { edgeZone = 64, maxSpeed = 14 } = optionsRef.current;
      const scrollContainer = resolveScrollContainer(optionsRef.current.scrollContainer);
      if (!scrollContainer) return;
      const box = scrollContainer.getBoundingClientRect();
      session.speed = resolveAutoScrollSpeed(session.lastClientY, box, edgeZone, maxSpeed);
      if (session.speed !== 0 && session.frame === null) {
        session.frame = requestAnimationFrame(runAutoScroll);
      }
    },
    [runAutoScroll]
  );

  const finish = useCallback((commit: boolean) => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    session.cleanup();
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    setDragging(null);
    if (commit && session.to !== session.from) {
      optionsRef.current.onDrop(session.from, session.to);
    }
  }, []);

  const startDragAt = useCallback(
    (index: number, start: PointerReorderStart) => {
      if (sessionRef.current) finish(false);
      const rects = optionsRef.current.getItemRects();
      if (!rects[index]) return;
      const { target, pointerId } = start;
      try {
        target?.setPointerCapture?.(pointerId);
      } catch {
        // 指针已释放时无法捕获，仍按窗口事件跟踪
      }

      const isSamePointer = (nativeEvent: PointerEvent) =>
        nativeEvent.pointerId === undefined || nativeEvent.pointerId === pointerId;
      const handleMove = (nativeEvent: PointerEvent) => {
        const session = sessionRef.current;
        if (!session || !isSamePointer(nativeEvent)) return;
        session.lastClientY = nativeEvent.clientY;
        update(session);
        syncAutoScroll(session);
      };
      const handleUp = (nativeEvent: PointerEvent) => {
        if (isSamePointer(nativeEvent)) finish(true);
      };
      const handleCancel = (nativeEvent: PointerEvent) => {
        if (isSamePointer(nativeEvent)) finish(false);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);

      sessionRef.current = {
        pointerId,
        from: index,
        rects,
        startClientY: start.clientY,
        startScrollTop: resolveScrollContainer(optionsRef.current.scrollContainer)?.scrollTop ?? 0,
        lastClientY: start.clientY,
        to: index,
        offsetY: 0,
        frame: null,
        speed: 0,
        cleanup: () => {
          window.removeEventListener("pointermove", handleMove);
          window.removeEventListener("pointerup", handleUp);
          window.removeEventListener("pointercancel", handleCancel);
          try {
            if (target?.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
          } catch {
            // 元素已卸载时无需释放
          }
        },
      };
      setDragging({ from: index, to: index, offsetY: 0 });
      navigator.vibrate?.(10);
    },
    [finish, syncAutoScroll, update]
  );

  const startDrag = useCallback(
    (index: number, event: ReactPointerEvent) => {
      if (!optionsRef.current.getItemRects()[index]) return;
      event.preventDefault();
      startDragAt(index, {
        clientY: event.clientY,
        pointerId: event.pointerId,
        target: event.currentTarget as Element,
      });
    },
    [startDragAt]
  );

  const cancelDrag = useCallback(() => finish(false), [finish]);

  useEffect(() => () => finish(false), [finish]);

  return { dragging, startDrag, startDragAt, cancelDrag };
}
