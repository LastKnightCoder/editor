import { memo, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";

import { ARROW_CONNECT_POINT_FILL, ARROW_CONNECT_POINT_RADIUS } from "../../constants";
import { SELECT_TOOL_ID } from "../../constants/tools";
import { useActiveTool, useBoardState, usePresentationState, useSelection } from "../../hooks";
import type { BoardElement, Point } from "../../types";
import ArrowConnectPoint from "../ArrowConnectPoint";
import { ArrowConnectPointOverlayContext } from "../../context";

type ArrowConnectPointData = {
  connectId: string;
  point: Point;
};

interface ArrowConnectPointGroupProps {
  element: BoardElement;
  points: ArrowConnectPointData[];
  isSelected: boolean;
  disabled?: boolean;
}

const supportsHoverPointer = () => {
  if (typeof window === "undefined") return false;
  const hasTouchPoints = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  if (typeof window.matchMedia !== "function") {
    return !hasTouchPoints;
  }
  const prefersCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const hasFinePointer = window.matchMedia("(any-pointer: fine)").matches;
  const isTouchOnlyDevice = hasTouchPoints && prefersCoarsePointer && !hasFinePointer;
  return !isTouchOnlyDevice;
};

const addMediaQueryChangeListener = (mediaQuery: MediaQueryList, listener: () => void) => {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return;
  }
  mediaQuery.addListener(listener);
};

const removeMediaQueryChangeListener = (mediaQuery: MediaQueryList, listener: () => void) => {
  if (typeof mediaQuery.removeEventListener === "function") {
    mediaQuery.removeEventListener("change", listener);
    return;
  }
  mediaQuery.removeListener(listener);
};

const useSupportsHoverPointer = () => {
  const [supportsHover, setSupportsHover] = useState(() => supportsHoverPointer());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQueries = [
      window.matchMedia("(hover: hover)"),
      window.matchMedia("(any-hover: hover)"),
      window.matchMedia("(pointer: coarse)"),
      window.matchMedia("(any-pointer: fine)"),
    ];
    const handleMediaQueryChange = () => {
      setSupportsHover(supportsHoverPointer());
    };

    mediaQueries.forEach(mediaQuery => {
      addMediaQueryChangeListener(mediaQuery, handleMediaQueryChange);
    });

    return () => {
      mediaQueries.forEach(mediaQuery => {
        removeMediaQueryChangeListener(mediaQuery, handleMediaQueryChange);
      });
    };
  }, []);

  return supportsHover;
};

const useIsConnectPointOwner = (elementId: string) => {
  const store = useBoardState().connectPointOwnerStore;

  const subscribe = useMemoizedFn((listener: () => void) => {
    if (!store) return () => {};
    return store.subscribe(listener);
  });

  const getSnapshot = useMemoizedFn(() => store?.getOwner() === elementId);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
};

const useConnectPointVisibility = ({
  elementId,
  enabled,
}: {
  elementId: string;
  enabled: boolean;
}) => {
  const store = useBoardState().connectPointOwnerStore;
  const isOwner = useIsConnectPointOwner(elementId);
  const [isDraggingFromConnectPoint, setIsDraggingFromConnectPoint] = useState(false);
  const isDraggingRef = useRef(false);
  const hoverCountRef = useRef(0);
  const handlePointPointerEnter = useMemoizedFn(() => {
    hoverCountRef.current += 1;
    store?.lock(elementId);
  });

  const handlePointPointerLeave = useMemoizedFn(() => {
    hoverCountRef.current = Math.max(0, hoverCountRef.current - 1);
    if (hoverCountRef.current === 0 && !isDraggingRef.current) {
      store?.unlock(elementId);
    }
  });

  const handleConnectStart = useMemoizedFn(() => {
    isDraggingRef.current = true;
    setIsDraggingFromConnectPoint(true);
    store?.lock(elementId);
  });

  useEffect(() => {
    if (!isDraggingFromConnectPoint) return;

    const handlePointerEnd = () => {
      isDraggingRef.current = false;
      setIsDraggingFromConnectPoint(false);
      if (hoverCountRef.current === 0) {
        store?.unlock(elementId);
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
  }, [elementId, isDraggingFromConnectPoint, store]);

  useEffect(() => {
    if (enabled || isDraggingRef.current) return;
    hoverCountRef.current = 0;
    store?.unlock(elementId);
  }, [elementId, enabled, store]);

  return {
    isOwner,
    isDraggingFromConnectPoint,
    handlePointPointerEnter,
    handlePointPointerLeave,
    handleConnectStart,
  };
};

const ArrowConnectPointGroup = memo((props: ArrowConnectPointGroupProps) => {
  const { element, points, isSelected, disabled = false } = props;

  const supportsHover = useSupportsHoverPointer();
  const overlayRef = useContext(ArrowConnectPointOverlayContext);
  const activeTool = useActiveTool();
  const { isPresentationMode } = usePresentationState();
  const selection = useSelection();
  const hasSelectedArrow = (selection?.selectedElements ?? []).some(
    selectedElement => selectedElement.type === "arrow"
  );
  const isCreatingElement = activeTool !== SELECT_TOOL_ID;
  const isInteractionSuppressed = hasSelectedArrow || isCreatingElement;
  const isConnectPointDisabled = disabled || isPresentationMode;
  const {
    isOwner,
    isDraggingFromConnectPoint,
    handlePointPointerEnter,
    handlePointPointerLeave,
    handleConnectStart,
  } = useConnectPointVisibility({
    elementId: element.id,
    enabled: supportsHover && !isConnectPointDisabled,
  });

  const isDisabledByDrop =
    (isConnectPointDisabled || isInteractionSuppressed) && !isDraggingFromConnectPoint;
  const showConnectPoints =
    !isPresentationMode &&
    (isSelected || (supportsHover && !isDisabledByDrop && (isOwner || isDraggingFromConnectPoint)));
  const connectPointNodes = showConnectPoints
    ? points.map(point => (
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
        (overlayContainer ? createPortal(connectPointNodes, overlayContainer) : connectPointNodes)}
    </>
  );
});

export default ArrowConnectPointGroup;
