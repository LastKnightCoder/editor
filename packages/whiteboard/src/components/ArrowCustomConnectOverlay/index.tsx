import { memo, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";

import { useBoard, useSelection } from "../../hooks";
import { ArrowConnectPointOverlayContext } from "../../context";
import { BoardUtil } from "../../utils";
import { ARROW_CONNECT_ID, ARROW_CUSTOM_BIND_MARKER_RADIUS } from "../../constants";
import type { ArrowElement, Point } from "../../types";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";

type SnapState = { point: Point } | null;

// 拖拽时（按住 alt）的自定义吸附点反馈，渲染到连接点覆盖层
const ArrowCustomSnapOverlay = memo(() => {
  const board = useBoard();
  const overlayRef = useContext(ArrowConnectPointOverlayContext);
  const [snap, setSnap] = useState<SnapState>(null);

  useEffect(() => {
    const handle = (data: SnapState) => setSnap(data);
    board.on("tau.arrow.custom-snap", handle);
    return () => {
      board.off("tau.arrow.custom-snap", handle);
    };
  }, [board]);

  const overlayContainer = overlayRef?.current ?? null;
  if (!overlayContainer || !snap) return null;

  return createPortal(
    <ArrowDropConnectPoint cx={snap.point.x} cy={snap.point.y} isActive={true} />,
    overlayContainer
  );
});

type CustomMarker = {
  key: string;
  x: number;
  y: number;
};

// 自定义连接点的常驻标记：绑定后始终在图形边缘显示小圆点，
// 选中所属箭头时高亮（半径变大、不透明度提高），便于发现和定位自定义连接。
const ArrowCustomBindMarkers = memo(() => {
  const board = useBoard();
  const selection = useSelection();
  const overlayRef = useContext(ArrowConnectPointOverlayContext);

  const selectedArrowIds = new Set(
    (selection?.selectedElements ?? [])
      .filter(element => element.type === "arrow")
      .map(element => element.id)
  );

  const collectMarker = useMemoizedFn(
    (arrow: ArrowElement, bound: ArrowElement["source"]): CustomMarker | null => {
      if (bound.connectId !== ARROW_CONNECT_ID.CUSTOM) return null;
      if (!bound.bindId || !bound.customOffset) return null;
      // 仅在所属箭头被选中时显示常驻标记，避免未选中时散落蓝点破坏画面
      if (!selectedArrowIds.has(arrow.id)) return null;
      const bindElement = BoardUtil.getElementById(board, bound.bindId);
      if (!bindElement) return null;
      const point = board.getArrowBindPoint(
        bindElement,
        ARROW_CONNECT_ID.CUSTOM,
        bound.customOffset
      );
      if (!point) return null;
      return {
        key: `${arrow.id}-${bound.bindId}`,
        x: point.x,
        y: point.y,
      };
    }
  );

  const markers: CustomMarker[] = [];
  for (const element of board.children) {
    if (element.type !== "arrow") continue;
    const arrow = element as ArrowElement;
    const sourceMarker = collectMarker(arrow, arrow.source);
    if (sourceMarker) markers.push(sourceMarker);
    const targetMarker = collectMarker(arrow, arrow.target);
    if (targetMarker) markers.push(targetMarker);
  }

  const overlayContainer = overlayRef?.current ?? null;
  if (!overlayContainer || markers.length === 0) return null;

  return createPortal(
    markers.map(marker => (
      <circle
        key={marker.key}
        cx={marker.x}
        cy={marker.y}
        r={ARROW_CUSTOM_BIND_MARKER_RADIUS + 1}
        fill="var(--tau-accent)"
        fillOpacity={0.45}
        style={{ pointerEvents: "none" }}
      />
    )),
    overlayContainer
  );
});

const ArrowCustomConnectOverlay = memo(() => {
  return (
    <>
      <ArrowCustomBindMarkers />
      <ArrowCustomSnapOverlay />
    </>
  );
});

export default ArrowCustomConnectOverlay;
