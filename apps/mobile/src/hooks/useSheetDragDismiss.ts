// 底部弹层下拉关闭手势：拖拽热区（data-sheet-drag-zone，即抓手/标题区）立即接管
// 向下拖拽；内容区仅在滚动到顶（scrollTop <= 0）时才接管，向上滑动始终让位给
// 原生内容滚动。松手按位移/速度判定关闭或回弹，关闭路径交由 AnimatePresence
// 的 exit 动画从当前 y 继续滑出，与手势自然衔接。
import { useMemoizedFn } from "ahooks";
import { animate, useMotionValue, type MotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { shouldIgnorePanDragStart } from "../components/PanContainer";

const DRAG_ZONE_SELECTOR = '[data-sheet-drag-zone="true"]';

// 判定阈值与 PanContainer 的 snapThresholdPx/snapVelocityPxPerMs 默认值保持一致
const CLOSE_THRESHOLD_PX = 56;
const CLOSE_VELOCITY_PX_PER_MS = 0.35;
const RESET_SPRING = { type: "spring", damping: 26, stiffness: 300, mass: 0.9 } as const;

type DragSession = {
  active: boolean;
  pointer: "touch" | "mouse";
  fromDragZone: boolean;
  /** 内容区出现向上滑动后放弃本次接管，让位原生滚动 */
  abandoned: boolean;
  dragging: boolean;
  startY: number;
  lastY: number;
  lastTs: number;
  velocityY: number;
};

export type SheetDragDismissOptions = {
  /** 仅面板展开时启用手势；退出动画期间不再接管 */
  enabled: boolean;
  onClose: () => void;
  /** 内容滚动容器；未提供视为不可滚动（下拉立即接管） */
  scrollRef?: React.RefObject<HTMLElement | null>;
};

export type SheetDragDismissBindings = {
  onTouchStart: (event: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  onMouseDown: (event: React.MouseEvent) => void;
};

export function useSheetDragDismiss(options: SheetDragDismissOptions): {
  y: MotionValue<number | string>;
  dragging: boolean;
  panelBindings: SheetDragDismissBindings;
} {
  const { enabled, onClose, scrollRef } = options;
  // 初值须与面板 initial={{ y: "100%" }} 一致：若为 0（与 animate 目标相同），
  // motion 会认为已到达目标而跳过入场动画
  const y = useMotionValue<number | string>("100%");
  const [dragging, setDragging] = useState(false);
  const sessionRef = useRef<DragSession>({
    active: false,
    pointer: "touch",
    fromDragZone: false,
    abandoned: false,
    dragging: false,
    startY: 0,
    lastY: 0,
    lastTs: 0,
    velocityY: 0,
  });
  const enabledRef = useRef(enabled);
  const cleanupRef = useRef<(() => void) | null>(null);
  enabledRef.current = enabled;

  const clearListeners = useMemoizedFn(() => {
    if (!cleanupRef.current) return;
    cleanupRef.current();
    cleanupRef.current = null;
  });

  const trackMove = useMemoizedFn((clientY: number, timeStamp: number, prevent: () => void) => {
    const session = sessionRef.current;
    if (!session.active || session.abandoned) return;

    const deltaY = clientY - session.startY;
    if (!session.dragging) {
      if (deltaY <= 0) {
        // 内容区一旦出现向上滑动即让位原生滚动；热区横滑/上滑仅持续跟随等待
        if (!session.fromDragZone) session.abandoned = true;
        session.lastY = clientY;
        session.lastTs = timeStamp;
        return;
      }
      const scrollTop = scrollRef?.current?.scrollTop ?? 0;
      if (!session.fromDragZone && scrollTop > 0) return;
      if (!session.fromDragZone) {
        // 内容滚动到顶后才接管：以当前触点为新起点，避免原生滚动期间累积的位移造成跳变
        session.startY = clientY;
        session.lastY = clientY;
        session.lastTs = timeStamp;
        session.velocityY = 0;
      }
      session.dragging = true;
      setDragging(true);
    }

    prevent();
    const dt = Math.max(1, timeStamp - session.lastTs);
    session.velocityY = (clientY - session.lastY) / dt;
    session.lastY = clientY;
    session.lastTs = timeStamp;
    y.set(Math.max(0, clientY - session.startY));
  });

  const endSession = useMemoizedFn(() => {
    clearListeners();
    const session = sessionRef.current;
    if (!session.active) return;
    session.active = false;
    if (!session.dragging) return;

    setDragging(false);
    const deltaY = session.lastY - session.startY;
    if (deltaY >= CLOSE_THRESHOLD_PX || session.velocityY >= CLOSE_VELOCITY_PX_PER_MS) {
      onClose();
      return;
    }
    animate(y, 0, RESET_SPRING);
  });

  const startSession = useMemoizedFn(
    (pointer: "touch" | "mouse", clientY: number, target: EventTarget | null) => {
      if (!enabledRef.current) return;
      if (!(target instanceof Element)) return;
      if (shouldIgnorePanDragStart(target)) return;

      // 打断进行中的入场/回弹动画，避免与手势竞速
      y.stop();
      sessionRef.current = {
        active: true,
        pointer,
        fromDragZone: target.closest(DRAG_ZONE_SELECTOR) !== null,
        abandoned: false,
        dragging: false,
        startY: clientY,
        lastY: clientY,
        lastTs: performance.now(),
        velocityY: 0,
      };
      clearListeners();

      if (pointer === "mouse") {
        const handleMove = (event: MouseEvent) => {
          trackMove(event.clientY, event.timeStamp || performance.now(), () => {
            event.preventDefault();
          });
        };
        const handleUp = () => endSession();
        document.addEventListener("mousemove", handleMove);
        document.addEventListener("mouseup", handleUp);
        cleanupRef.current = () => {
          document.removeEventListener("mousemove", handleMove);
          document.removeEventListener("mouseup", handleUp);
        };
        return;
      }

      const handleTouchMove = (event: TouchEvent) => {
        const touch = event.touches[0];
        if (!touch) return;
        trackMove(touch.clientY, event.timeStamp || performance.now(), () => {
          event.preventDefault();
        });
      };
      const handleTouchEnd = () => endSession();
      document.addEventListener("touchmove", handleTouchMove, { passive: false });
      document.addEventListener("touchend", handleTouchEnd);
      document.addEventListener("touchcancel", handleTouchEnd);
      cleanupRef.current = () => {
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
        document.removeEventListener("touchcancel", handleTouchEnd);
      };
    }
  );

  useEffect(() => {
    if (enabled) return;
    // 面板关闭（进入退出动画）：中止进行中的手势会话，由 exit 动画接管 y
    clearListeners();
    sessionRef.current.active = false;
    setDragging(false);
  }, [clearListeners, enabled]);

  useEffect(() => () => clearListeners(), [clearListeners]);

  return {
    y,
    dragging,
    panelBindings: {
      onTouchStart: event => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        startSession("touch", touch.clientY, event.target);
      },
      onTouchEnd: endSession,
      onTouchCancel: endSession,
      onMouseDown: event => {
        if (event.button !== 0) return;
        startSession("mouse", event.clientY, event.target);
      },
    },
  };
}
