import { memo, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";

import {
  ARROW_CONNECT_POINT_FILL,
  ARROW_CONNECT_POINT_RADIUS,
  ARROW_CONNECT_PROXIMITY_HIDE_DELAY,
  ARROW_CONNECT_PROXIMITY_RADIUS,
} from "../../constants";
import {
  useCreateElementType,
  usePresentationState,
  useSelection,
  usePointerViewport,
} from "../../hooks";
import {
  ECreateBoardElementType,
  type BoardElement,
  type Point,
} from "../../types";
import ArrowConnectPoint from "../ArrowConnectPoint";
import { ArrowConnectPointOverlayContext } from "../../context";

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
  pointerViewport,
}: {
  supportsHover: boolean;
  disabled: boolean;
  isSelected: boolean;
  proximityBounds: ProximityBounds;
  pointerViewport: Point | null;
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

    const handlePointerEnd = () => {
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

    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("blur", handlePointerEnd);
    return () => {
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("blur", handlePointerEnd);
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
        pointerViewport,
        proximityBounds,
        ARROW_CONNECT_PROXIMITY_RADIUS,
      ),
    );
  }, [
    clearHideTimer,
    disabled,
    isDraggingFromConnectPoint,
    isSelected,
    pointerViewport,
    proximityBounds,
    supportsHover,
  ]);

  useEffect(() => {
    if (
      !supportsHover ||
      disabled ||
      isSelected ||
      isDraggingFromConnectPoint
    ) {
      return;
    }

    const isNear = isPointerNearBounds(
      pointerViewport,
      proximityBounds,
      ARROW_CONNECT_PROXIMITY_RADIUS,
    );
    if (isNear) {
      showByProximity();
      return;
    }
    if (isProximityVisible) {
      scheduleHideByProximity();
    }
  }, [
    disabled,
    isDraggingFromConnectPoint,
    isProximityVisible,
    isSelected,
    pointerViewport,
    proximityBounds,
    scheduleHideByProximity,
    showByProximity,
    supportsHover,
  ]);

  return {
    isProximityVisible,
    isDraggingFromConnectPoint,
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
  const pointerViewport = usePointerViewport();
  const createElementType = useCreateElementType();
  const { isPresentationMode } = usePresentationState();
  const selection = useSelection();
  const hasSelectedArrow = (selection?.selectedElements ?? []).some(
    (selectedElement) => selectedElement.type === "arrow",
  );
  const isCreatingElement = createElementType !== ECreateBoardElementType.None;
  const isInteractionSuppressed = hasSelectedArrow || isCreatingElement;
  const isConnectPointDisabled = disabled || isPresentationMode;
  const {
    isProximityVisible,
    isDraggingFromConnectPoint,
    handlePointPointerEnter,
    handlePointPointerLeave,
    handleConnectStart,
  } = useConnectPointVisibility({
    supportsHover,
    disabled: isConnectPointDisabled,
    isSelected,
    proximityBounds,
    pointerViewport,
  });

  const isDisabledByDrop =
    (isConnectPointDisabled || isInteractionSuppressed) &&
    !isDraggingFromConnectPoint;
  const showConnectPoints =
    !isPresentationMode &&
    (isSelected ||
      (supportsHover &&
        !isDisabledByDrop &&
        (isProximityVisible || isDraggingFromConnectPoint)));
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
      {connectPointNodes &&
        (overlayContainer
          ? createPortal(connectPointNodes, overlayContainer)
          : connectPointNodes)}
    </>
  );
});

export default ArrowConnectPointGroup;
