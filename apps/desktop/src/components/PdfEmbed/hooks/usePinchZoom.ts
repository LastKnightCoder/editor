import { useEffect, useRef, useCallback, RefObject } from "react";

interface UsePinchZoomOptions {
  /** 缩放回调，delta > 0 放大，delta < 0 缩小 */
  onZoom: (delta: number, centerX: number, centerY: number) => void;
  /** 是否启用双指缩放 */
  enabled?: boolean;
  /** 外部传入的容器 ref（如果不传则内部创建） */
  containerRef?: RefObject<HTMLElement | null>;
}

export const usePinchZoom = ({
  onZoom,
  enabled = true,
  containerRef: externalRef,
}: UsePinchZoomOptions) => {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const lastDistanceRef = useRef<number | null>(null);
  const lastCenterRef = useRef<{ x: number; y: number } | null>(null);
  // 使用 ref 保存 onZoom，避免依赖变化导致重新绑定
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  const getDistance = useCallback((touches: TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getCenter = useCallback((touches: TouchList) => {
    if (touches.length < 2) return { x: 0, y: 0 };
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }, []);

  useEffect(() => {
    const container = externalRef?.current ?? internalRef.current;
    if (!container || !enabled) {
      return;
    }

    // ========== 触摸屏双指缩放 ==========
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        e.stopPropagation();
        lastDistanceRef.current = getDistance(e.touches);
        lastCenterRef.current = getCenter(e.touches);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastDistanceRef.current !== null) {
        e.preventDefault();
        e.stopPropagation();
        const newDistance = getDistance(e.touches);
        const center = getCenter(e.touches);

        const scaleDelta = newDistance / lastDistanceRef.current;
        const zoomDelta = (scaleDelta - 1) * 0.5;

        if (Math.abs(zoomDelta) > 0.001) {
          onZoomRef.current(zoomDelta, center.x, center.y);
        }

        lastDistanceRef.current = newDistance;
        lastCenterRef.current = center;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastDistanceRef.current = null;
        lastCenterRef.current = null;
      }
    };

    // ========== 触控板双指缩放 (wheel + ctrlKey) ==========
    let accumulatedDelta = 0;
    let rafId: number | null = null;
    let lastCenter = { x: 0, y: 0 };

    const flushZoom = () => {
      if (Math.abs(accumulatedDelta) > 0.001) {
        onZoomRef.current(accumulatedDelta, lastCenter.x, lastCenter.y);
        accumulatedDelta = 0;
      }
      rafId = null;
    };

    const handleWheel = (e: WheelEvent) => {
      // Mac 触控板双指缩放会触发 wheel 事件，并且 ctrlKey 为 true
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        // deltaY < 0 表示放大，> 0 表示缩小
        // 降低灵敏度，累积 delta
        accumulatedDelta += -e.deltaY * 0.005;
        lastCenter = { x: e.clientX, y: e.clientY };

        // 使用 requestAnimationFrame 节流，确保每帧最多更新一次
        if (rafId === null) {
          rafId = requestAnimationFrame(flushZoom);
        }
      }
    };

    // 触摸事件 - 使用 capture 阶段
    container.addEventListener("touchstart", handleTouchStart, {
      passive: false,
      capture: true,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
      capture: true,
    });
    container.addEventListener("touchend", handleTouchEnd, { capture: true });
    container.addEventListener("touchcancel", handleTouchEnd, {
      capture: true,
    });

    // 触控板缩放事件
    container.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart, {
        capture: true,
      });
      container.removeEventListener("touchmove", handleTouchMove, {
        capture: true,
      });
      container.removeEventListener("touchend", handleTouchEnd, {
        capture: true,
      });
      container.removeEventListener("touchcancel", handleTouchEnd, {
        capture: true,
      });
      container.removeEventListener("wheel", handleWheel, { capture: true });
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        accumulatedDelta = 0;
      }
    };
  }, [enabled, externalRef, getDistance, getCenter]);

  return internalRef;
};
