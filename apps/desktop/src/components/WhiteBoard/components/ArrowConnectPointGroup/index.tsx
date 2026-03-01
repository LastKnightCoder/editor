import {
  memo,
  useContext,
  useEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";

import {
  ARROW_CONNECT_POINT_FILL,
  ARROW_CONNECT_POINT_RADIUS,
  ARROW_CONNECT_PROXIMITY_HIDE_DELAY,
  ARROW_CONNECT_PROXIMITY_RADIUS,
} from "../../constants";
import { useCreateElementType, useSelection } from "../../hooks";
import {
  ECreateBoardElementType,
  type BoardElement,
  type Point,
} from "../../types";
import ArrowConnectPoint from "../ArrowConnectPoint";
import {
  ArrowConnectPointOverlayContext,
  PointerViewportPositionContext,
} from "../../context";

type ArrowConnectPointData = {
  connectId: string;
  point: Point;
};

type ProximityBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface ArrowConnectPointGroupProps {
  element: BoardElement;
  points: ArrowConnectPointData[];
  proximityBounds: ProximityBounds;
  isSelected: boolean;
  disabled?: boolean;
}

const supportsHoverPointer = () => {
  if (typeof window === "undefined") return false;
  const hasTouchPoints =
    typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  if (typeof window.matchMedia !== "function") {
    return !hasTouchPoints;
  }
  const prefersCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const hasFinePointer = window.matchMedia("(any-pointer: fine)").matches;
  const isTouchOnlyDevice =
    hasTouchPoints && prefersCoarsePointer && !hasFinePointer;
  return !isTouchOnlyDevice;
};

const addMediaQueryChangeListener = (
  mediaQuery: MediaQueryList,
  listener: () => void,
) => {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return;
  }
  mediaQuery.addListener(listener);
};

const removeMediaQueryChangeListener = (
  mediaQuery: MediaQueryList,
  listener: () => void,
) => {
  if (typeof mediaQuery.removeEventListener === "function") {
    mediaQuery.removeEventListener("change", listener);
    return;
  }
  mediaQuery.removeListener(listener);
};

const isPointerNearBounds = (
  pointer: Point | null | undefined,
  bounds: ProximityBounds,
  radius: number,
) => {
  if (!pointer) return false;

  const minX = bounds.x - radius;
  const maxX = bounds.x + bounds.width + radius;
  const minY = bounds.y - radius;
  const maxY = bounds.y + bounds.height + radius;

  return (
    pointer.x >= minX &&
    pointer.x <= maxX &&
    pointer.y >= minY &&
    pointer.y <= maxY
  );
};

const useSupportsHoverPointer = () => {
  const [supportsHover, setSupportsHover] = useState(() =>
    supportsHoverPointer(),
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;

    const mediaQueries = [
      window.matchMedia("(hover: hover)"),
      window.matchMedia("(any-hover: hover)"),
      window.matchMedia("(pointer: coarse)"),
      window.matchMedia("(any-pointer: fine)"),
    ];
    const handleMediaQueryChange = () => {
      setSupportsHover(supportsHoverPointer());
    };

    mediaQueries.forEach((mediaQuery) => {
      addMediaQueryChangeListener(mediaQuery, handleMediaQueryChange);
    });

    return () => {
      mediaQueries.forEach((mediaQuery) => {
        removeMediaQueryChangeListener(mediaQuery, handleMediaQueryChange);
      });
    };
  }, []);

  return supportsHover;
};

const useConnectPointVisibility = ({
  supportsHover,
  disabled,
  isSelected,
  proximityBounds,
  pointerViewportRef,
}: {
  supportsHover: boolean;
  disabled: boolean;
  isSelected: boolean;
  proximityBounds: ProximityBounds;
  pointerViewportRef: RefObject<Point | null> | null;
}) => {
  const [isProximityVisible, setIsProximityVisible] = useState(false);
  const [isDraggingFromConnectPoint, setIsDraggingFromConnectPoint] =
    useState(false);
  const hoverCountRef = useRef(0);
  const hideTimerRef = useRef<number | null>(null);
  const previousSelectedRef = useRef(isSelected);

  const clearHideTimer = useMemoizedFn(() => {
    if (hideTimerRef.current == null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  });

  const showByProximity = useMemoizedFn(() => {
    if (!supportsHover || disabled) return;
    clearHideTimer();
    setIsProximityVisible(true);
  });

  const scheduleHideByProximity = useMemoizedFn(() => {
    if (!supportsHover || disabled || isDraggingFromConnectPoint) return;
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      if (hoverCountRef.current === 0 && !isDraggingFromConnectPoint) {
        setIsProximityVisible(false);
      }
    }, ARROW_CONNECT_PROXIMITY_HIDE_DELAY);
  });

  const handlePointPointerEnter = useMemoizedFn(() => {
    hoverCountRef.current += 1;
    showByProximity();
  });

  const handlePointPointerLeave = useMemoizedFn(() => {
    hoverCountRef.current = Math.max(0, hoverCountRef.current - 1);
    if (hoverCountRef.current === 0) {
      scheduleHideByProximity();
    }
  });

  const handleConnectStart = useMemoizedFn(() => {
    clearHideTimer();
    setIsProximityVisible(true);
    setIsDraggingFromConnectPoint(true);
  });

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer]);

  useEffect(() => {
    if (!isDraggingFromConnectPoint) return;

    const handlePointerUp = () => {
      setIsDraggingFromConnectPoint(false);
      if (hoverCountRef.current === 0) {
        clearHideTimer();
        hideTimerRef.current = window.setTimeout(() => {
          if (hoverCountRef.current === 0) {
            setIsProximityVisible(false);
          }
        }, ARROW_CONNECT_PROXIMITY_HIDE_DELAY);
      }
    };

    document.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [clearHideTimer, isDraggingFromConnectPoint]);

  useEffect(() => {
    if (!supportsHover || (disabled && !isDraggingFromConnectPoint)) {
      hoverCountRef.current = 0;
      clearHideTimer();
      setIsProximityVisible(false);
    }
  }, [clearHideTimer, disabled, isDraggingFromConnectPoint, supportsHover]);

  useEffect(() => {
    const wasSelected = previousSelectedRef.current;
    previousSelectedRef.current = isSelected;

    if (!wasSelected || isSelected || isDraggingFromConnectPoint) return;

    hoverCountRef.current = 0;
    clearHideTimer();

    if (!supportsHover || disabled) {
      setIsProximityVisible(false);
      return;
    }

    setIsProximityVisible(
      isPointerNearBounds(
        pointerViewportRef?.current,
        proximityBounds,
        ARROW_CONNECT_PROXIMITY_RADIUS,
      ),
    );
  }, [
    clearHideTimer,
    disabled,
    isDraggingFromConnectPoint,
    isSelected,
    pointerViewportRef,
    proximityBounds,
    supportsHover,
  ]);

  return {
    isProximityVisible,
    isDraggingFromConnectPoint,
    showByProximity,
    scheduleHideByProximity,
    handlePointPointerEnter,
    handlePointPointerLeave,
    handleConnectStart,
  };
};

const ArrowConnectPointGroup = memo((props: ArrowConnectPointGroupProps) => {
  const {
    element,
    points,
    proximityBounds,
    isSelected,
    disabled = false,
  } = props;

  const supportsHover = useSupportsHoverPointer();
  const overlayRef = useContext(ArrowConnectPointOverlayContext);
  const pointerViewportRef = useContext(PointerViewportPositionContext);
  const createElementType = useCreateElementType();
  const selection = useSelection();
  const hasSelectedArrow = (selection?.selectedElements ?? []).some(
    (selectedElement) => selectedElement.type === "arrow",
  );
  const isCreatingElement = createElementType !== ECreateBoardElementType.None;
  const isInteractionSuppressed = hasSelectedArrow || isCreatingElement;
  const {
    isProximityVisible,
    isDraggingFromConnectPoint,
    showByProximity,
    scheduleHideByProximity,
    handlePointPointerEnter,
    handlePointPointerLeave,
    handleConnectStart,
  } = useConnectPointVisibility({
    supportsHover,
    disabled,
    isSelected,
    proximityBounds,
    pointerViewportRef,
  });

  const isDisabledByDrop =
    (disabled || isInteractionSuppressed) && !isDraggingFromConnectPoint;
  const showConnectPoints =
    isSelected ||
    (supportsHover &&
      !isDisabledByDrop &&
      (isProximityVisible || isDraggingFromConnectPoint));
  const showProximityArea =
    supportsHover &&
    !isDisabledByDrop &&
    !isSelected &&
    !isDraggingFromConnectPoint;
  const preventDefaultOnPointerDown: PointerEventHandler<SVGRectElement> = (
    e,
  ) => {
    e.preventDefault();
  };
  const preventDefaultOnMouseDown: MouseEventHandler<SVGRectElement> = (e) => {
    e.preventDefault();
  };
  const clearProximityFocus: FocusEventHandler<SVGRectElement> = (e) => {
    e.currentTarget.blur?.();
  };
  const connectPointNodes = showConnectPoints
    ? points.map((point) => (
        <ArrowConnectPoint
          key={`${element.id}-${point.connectId}`}
          element={element}
          connectId={point.connectId}
          x={point.point.x}
          y={point.point.y}
          r={ARROW_CONNECT_POINT_RADIUS}
          fill={ARROW_CONNECT_POINT_FILL}
          onConnectStart={handleConnectStart}
          onPointerEnter={handlePointPointerEnter}
          onPointerLeave={handlePointPointerLeave}
        />
      ))
    : null;
  const overlayContainer = overlayRef?.current ?? null;

  return (
    <>
      {showProximityArea && (
        <rect
          x={proximityBounds.x - ARROW_CONNECT_PROXIMITY_RADIUS}
          y={proximityBounds.y - ARROW_CONNECT_PROXIMITY_RADIUS}
          width={proximityBounds.width + ARROW_CONNECT_PROXIMITY_RADIUS * 2}
          height={proximityBounds.height + ARROW_CONNECT_PROXIMITY_RADIUS * 2}
          fill="transparent"
          stroke="none"
          focusable={false}
          tabIndex={-1}
          style={{ outline: "none" }}
          pointerEvents="all"
          onPointerDown={preventDefaultOnPointerDown}
          onMouseDown={preventDefaultOnMouseDown}
          onFocus={clearProximityFocus}
          onPointerEnter={showByProximity}
          onPointerMove={showByProximity}
          onPointerLeave={scheduleHideByProximity}
        />
      )}
      {connectPointNodes &&
        (overlayContainer
          ? createPortal(connectPointNodes, overlayContainer)
          : connectPointNodes)}
    </>
  );
});

export default ArrowConnectPointGroup;
