import { useEffect, useRef } from "react";
import { useAnimationControls } from "motion/react";
import { createVelocityTracker, shouldCommitSwipe } from "./swipeCommit";
import { SCREEN_PARALLAX_RATIO } from "./transition";

// motion/react 未直接导出 AnimationControls 类型名，从 hook 推导
export type GestureAnimationControls = ReturnType<typeof useAnimationControls>;

export const EDGE_START_WIDTH = 28;
const LOCK_THRESHOLD_PX = 8;
const FALLBACK_VIEWPORT_WIDTH = 375;

export type EdgeBackGestureConfig = {
  enabled: boolean;
  activeEntryId: string | null;
  underlayEntryId: string | null;
  controlsMap: Map<string, GestureAnimationControls>;
  /** underlay 完全移出屏外（tab 根压 tab 根）时按全宽跟手，否则默认视差比例 */
  underlayOffscreen?: boolean;
  /** 起手时询问：栈顶页有必定消费返回的页内层（浮层、块选择等）时为 true，手势不跟手 */
  isBlocked?: () => boolean;
  /** 返回 true 表示已驱动回退；false（守卫拒绝等）时手势需回弹 */
  onBack: () => Promise<boolean> | boolean;
};

/** 自带拖拽的控件（如编辑器块把手）标记 data-no-edge-back：从其上起手的触点不参与边缘返回 */
export function isMarkedNoEdgeBack(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest("[data-no-edge-back]") !== null;
}

export function getViewportWidth(): number {
  if (typeof window === "undefined" || window.innerWidth <= 0) {
    return FALLBACK_VIEWPORT_WIDTH;
  }
  return window.innerWidth;
}

/**
 * 左边缘跟手返回：拖动栈顶页实时位移并露出下层视差层，
 * 松手按位移/速度阈值决定返回或回弹。
 */
export function useEdgeBackGesture(config: EdgeBackGestureConfig): void {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    let tracking = false;
    let locked = false;
    let startX = 0;
    let startY = 0;
    const tracker = createVelocityTracker();

    const underlayRatio = (): number =>
      configRef.current.underlayOffscreen ? 1 : SCREEN_PARALLAX_RATIO;

    const applyDrag = (dx: number): number => {
      const { controlsMap, activeEntryId, underlayEntryId } = configRef.current;
      const width = getViewportWidth();
      const progress = Math.min(Math.max(dx / width, 0), 1);
      const activeControls = activeEntryId ? controlsMap.get(activeEntryId) : undefined;
      activeControls?.set({ x: `${progress * 100}%` });
      const underlayControls = underlayEntryId ? controlsMap.get(underlayEntryId) : undefined;
      underlayControls?.set({
        x: `${-underlayRatio() * (1 - progress) * 100}%`,
      });
      return progress;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }
      const cfg = configRef.current;
      if (!cfg.enabled || !cfg.activeEntryId) {
        return;
      }
      const touch = event.touches[0];
      if (
        touch.clientX > EDGE_START_WIDTH ||
        isMarkedNoEdgeBack(event.target) ||
        cfg.isBlocked?.()
      ) {
        return;
      }
      tracking = true;
      locked = false;
      startX = touch.clientX;
      startY = touch.clientY;
      tracker.reset(touch.clientX, performance.now());
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) {
        return;
      }
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!locked) {
        // 横向意图明确后才锁定，避免与纵向滚动冲突
        if (Math.abs(dx) < LOCK_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) {
          return;
        }
        locked = true;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      tracker.add(touch.clientX, performance.now());
      applyDrag(Math.max(0, dx));
    };

    const springBack = (): void => {
      const { controlsMap, activeEntryId, underlayEntryId } = configRef.current;
      const activeControls = activeEntryId ? controlsMap.get(activeEntryId) : undefined;
      const underlayControls = underlayEntryId ? controlsMap.get(underlayEntryId) : undefined;
      void activeControls?.start({
        x: "0%",
        transition: { type: "spring", stiffness: 420, damping: 38 },
      });
      void underlayControls?.start({
        x: `${-underlayRatio() * 100}%`,
        transition: { type: "spring", stiffness: 420, damping: 38 },
      });
    };

    const finish = (event: TouchEvent) => {
      if (!tracking) {
        return;
      }
      const wasLocked = locked;
      tracking = false;
      locked = false;
      if (!wasLocked) {
        return;
      }

      const touch = event.changedTouches[0];
      const now = performance.now();
      tracker.add(touch.clientX, now);
      const progress = applyDrag(Math.max(0, touch.clientX - startX));
      const { controlsMap, activeEntryId, underlayEntryId, onBack } = configRef.current;
      const activeControls = activeEntryId ? controlsMap.get(activeEntryId) : undefined;
      const underlayControls = underlayEntryId ? controlsMap.get(underlayEntryId) : undefined;

      const shouldCommit = shouldCommitSwipe({
        distance: touch.clientX - startX,
        velocity: tracker.velocity(now),
        viewportWidth: getViewportWidth(),
      });
      if (shouldCommit) {
        const remaining = Math.max(1 - progress, 0.05);
        void activeControls?.start({
          x: "100%",
          transition: {
            duration: Math.max(remaining * 0.25, 0.08),
            ease: [0.4, 0, 1, 1],
          },
        });
        void underlayControls?.start({
          x: "0%",
          transition: {
            duration: Math.max(remaining * 0.3, 0.1),
            ease: [0.22, 1, 0.36, 1],
          },
        });
        void Promise.resolve(onBack()).then(driven => {
          // 守卫拒绝等未驱动回退时回弹，页面回到可交互位置
          if (!driven) {
            springBack();
          }
        });
        return;
      }

      springBack();
    };

    const onTouchCancel = (): void => {
      if (!tracking) {
        return;
      }
      const wasLocked = locked;
      tracking = false;
      locked = false;
      if (wasLocked) {
        springBack();
      }
    };

    document.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchend", finish, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchcancel", onTouchCancel, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, {
        capture: true,
      });
      document.removeEventListener("touchmove", onTouchMove, {
        capture: true,
      });
      document.removeEventListener("touchend", finish, {
        capture: true,
      });
      document.removeEventListener("touchcancel", onTouchCancel, {
        capture: true,
      });
    };
  }, []);
}

export default useEdgeBackGesture;
