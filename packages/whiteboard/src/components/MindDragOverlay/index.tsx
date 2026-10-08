import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import type Board from "../../Board";
import { BOARD_TO_CONTAINER } from "../../constants/map";
import { getMindDragSourceId } from "../../constants/mind";
import type { MindDragState } from "../../types/mind";

interface MindDragStore {
  name: string;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => MindDragState;
}

const EMPTY_MIND_DRAG_STATE: MindDragState = {
  mode: null,
  isDragging: false,
  draggedNode: null,
  sourceRootId: null,
  originalParentId: null,
  startPoint: null,
  dragOffset: { x: 0, y: 0 },
  previewNode: null,
  currentTarget: null,
  connectionLineColor: null,
  pointerId: null,
};

const MindDragOverlay = ({ board }: { board: Board }) => {
  const plugin = board.getPlugin?.<MindDragStore>("mind-node");
  const subscribe = useCallback(
    (listener: () => void) => plugin?.subscribe(listener) ?? (() => {}),
    [plugin]
  );
  const getSnapshot = useCallback(() => plugin?.getSnapshot() ?? EMPTY_MIND_DRAG_STATE, [plugin]);
  const dragState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { draggedNode, previewNode, currentTarget, connectionLineColor, isDragging, mode } =
    dragState;
  const showsPreview = mode === "preview";
  const previewContainerRef = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    const previewContainer = previewContainerRef.current;
    if (!previewContainer) return;

    previewContainer.replaceChildren();
    if (!isDragging || !draggedNode || !showsPreview) return;

    const source = BOARD_TO_CONTAINER.get(board)?.querySelector(
      "[id=" + JSON.stringify(getMindDragSourceId(draggedNode.id)) + "]"
    );
    if (!source) return;

    const clone = source.cloneNode(true) as Element;
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach(element => {
      element.removeAttribute("id");
    });
    clone.setAttribute("data-mind-drag-preview-clone", "true");
    previewContainer.appendChild(clone);

    return () => {
      previewContainer.replaceChildren();
    };
  }, [draggedNode?.id, isDragging, showsPreview]);

  if (!isDragging || !draggedNode || !previewNode) return null;

  const zoom = Math.max(board.viewPort.zoom, 0.01);
  const translateX = previewNode.x - draggedNode.x;
  const translateY = previewNode.y - draggedNode.y;
  const connectionPath = currentTarget
    ? [
        `M ${currentTarget.connectionStart.x} ${currentTarget.connectionStart.y}`,
        `C ${(currentTarget.connectionStart.x + currentTarget.connectionEnd.x) / 2} ${currentTarget.connectionStart.y}`,
        `${(currentTarget.connectionStart.x + currentTarget.connectionEnd.x) / 2} ${currentTarget.connectionEnd.y}`,
        `${currentTarget.connectionEnd.x} ${currentTarget.connectionEnd.y}`,
      ].join(" ")
    : null;

  if (!showsPreview && !connectionPath) return null;

  return (
    <g
      data-layer="mind-drag-overlay"
      data-export-ignore="true"
      pointerEvents="none"
      aria-hidden="true"
    >
      {connectionPath && (
        <path
          d={connectionPath}
          stroke={connectionLineColor || "currentColor"}
          strokeWidth={2 / zoom}
          strokeDasharray={`${6 / zoom} ${4 / zoom}`}
          opacity={0.8}
          fill="none"
        />
      )}
      {showsPreview && (
        <g
          ref={previewContainerRef}
          data-mind-drag-preview={draggedNode.id}
          transform={`translate(${translateX} ${translateY})`}
          opacity={0.9}
        />
      )}
    </g>
  );
};

export default MindDragOverlay;
