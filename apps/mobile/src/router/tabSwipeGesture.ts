// Tab 根全屏左右滑切换手势（检测层）：只负责输入判定（方向锁、阈值、让位规则），
// 渲染与动画驱动（预览层挂载 / controls 位移）在 PageHost 侧完成。
// 让位规则：data-no-tab-swipe 标记区域、可横向滚动的祖先容器（如筛选 chips 行）、
// 左边缘返回手势激活区（栈深>1 时前 28px，语义本就同为回上个 tab）。

import { useEffect, useRef } from "react";
import { EDGE_START_WIDTH, getViewportWidth } from "./gesture";
import { resolveTabNeighbor } from "./tabs";

const LOCK_THRESHOLD_PX = 8;
const COMMIT_PROGRESS = 0.4;
const COMMIT_VELOCITY_PX_PER_MS = 0.5;

/** 1 = 从右向左滑（下一个 tab），-1 = 从左向右滑（上一个 tab） */
export type TabSwipeDirection = 1 | -1;

export type TabSwipeGestureConfig = {
  enabled: boolean;
  /** 当前激活的 Tab 根 key（topKey 为 Tab 根时才非空） */
  activeTabKey: string | null;
  /** 左边缘返回手势启用（栈深>1）时，起点须避开边缘区 */
  edgeBackEnabled: boolean;
  /** 方向锁定且存在目标 tab：挂预览层/提层，开始跟手 */
  onEngage: (targetKey: string, direction: TabSwipeDirection) => void;
  /** 跟手进度，已按锁定方向投影到 (0,1] */
  onMove: (progress: number) => void;
  /** 松手达到提交阈值（progress / velocity） */
  onCommit: (progress: number) => void;
  /** 松手未达阈值或 touchcancel：回弹并清理 */
  onCancel: () => void;
};

export function isMarkedNoTabSwipe(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest("[data-no-tab-swipe]") !== null;
}

export function isInsideHorizontalScroller(node: EventTarget | null): boolean {
  let el = node instanceof Element ? node : null;
  while (el && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const scrollsX = style.overflowX === "auto" || style.overflowX === "scroll";
    if (scrollsX && el.scrollWidth > el.clientWidth) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** 位移投影到手势前进方向：next 前进为 dx<0、prev 为 dx>0，统一乘 -direction；
 *  反向拖动记 0，避免页面滑过起点 */
function projectProgress(dx: number, direction: TabSwipeDirection): number {
  const signed = dx * -direction;
  if (signed <= 0) return 0;
  return Math.min(signed / getViewportWidth(), 1);
}

export function useTabSwipeGesture(config: TabSwipeGestureConfig): void {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    let tracking = false;
    let locked = false;
    let direction: TabSwipeDirection = 1;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }
      const cfg = configRef.current;
      if (!cfg.enabled || !cfg.activeTabKey) {
        return;
      }
      const touch = event.touches[0];
      if (cfg.edgeBackEnabled && touch.clientX <= EDGE_START_WIDTH) {
        return;
      }
      if (isMarkedNoTabSwipe(event.target) || isInsideHorizontalScroller(event.target)) {
        return;
      }
      tracking = true;
      locked = false;
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = touch.clientX;
      lastT = performance.now();
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
        const cfg = configRef.current;
        const dir: TabSwipeDirection = dx < 0 ? 1 : -1;
        const targetKey = cfg.activeTabKey ? resolveTabNeighbor(cfg.activeTabKey, dir) : null;
        if (!targetKey) {
          // 边界 tab 无邻居：放弃跟踪，放任原生行为
          tracking = false;
          return;
        }
        direction = dir;
        locked = true;
        cfg.onEngage(targetKey, dir);
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      lastX = touch.clientX;
      lastT = performance.now();
      configRef.current.onMove(projectProgress(touch.clientX - startX, direction));
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
      const dt = Math.max(now - lastT, 1);
      // 速度沿手势前进方向投影：next 前进为 clientX 减小，回拖（撤销手势）得负速度不提交
      const velocity = ((touch.clientX - lastX) * -direction) / dt;
      const progress = projectProgress(touch.clientX - startX, direction);
      if (progress >= COMMIT_PROGRESS || velocity >= COMMIT_VELOCITY_PX_PER_MS) {
        configRef.current.onCommit(progress);
      } else {
        configRef.current.onCancel();
      }
    };

    const onTouchCancel = () => {
      if (!tracking) {
        return;
      }
      const wasLocked = locked;
      tracking = false;
      locked = false;
      if (wasLocked) {
        configRef.current.onCancel();
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
