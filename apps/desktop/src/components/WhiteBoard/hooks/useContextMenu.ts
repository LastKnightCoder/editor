import { RefObject, useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";

import { Board, BoardContextMenuPayload } from "../types";

const MIN_MENU_WIDTH = 200;
const MIN_MENU_HEIGHT = 140;
const MENU_PADDING = 12;

export interface ContextMenuState {
  position: { x: number; y: number };
  context: BoardContextMenuPayload;
}

export const useContextMenu = (
  board: Board,
  containerRef: RefObject<HTMLDivElement>,
) => {
  const [state, setState] = useState<ContextMenuState | null>(null);

  const hide = useMemoizedFn(() => {
    setState(null);
  });

  const showFromPayload = useMemoizedFn((payload: BoardContextMenuPayload) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const rawX = payload.clientX - rect.left;
    const rawY = payload.clientY - rect.top;

    const maxX = Math.max(
      MENU_PADDING,
      container.clientWidth - MIN_MENU_WIDTH - MENU_PADDING,
    );
    const maxY = Math.max(
      MENU_PADDING,
      container.clientHeight - MIN_MENU_HEIGHT - MENU_PADDING,
    );

    const safeX = Math.min(Math.max(MENU_PADDING, rawX), maxX);
    const safeY = Math.min(Math.max(MENU_PADDING, rawY), maxY);

    setState({
      position: { x: safeX, y: safeY },
      context: payload,
    });
  });

  useEffect(() => {
    const handler = (payload: BoardContextMenuPayload) => {
      showFromPayload(payload);
    };
    board.on("context-menu", handler);
    return () => {
      board.off("context-menu", handler);
    };
  }, [board, showFromPayload]);

  useEffect(() => {
    if (!state) return;
    const handlePointerDown = () => hide();
    const handleWheel = () => hide();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("wheel", handleWheel, { passive: true });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("wheel", handleWheel);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [state, hide]);

  useEffect(() => {
    const handleReadonlyChange = () => hide();
    board.on("readonlyChange", handleReadonlyChange);
    return () => {
      board.off("readonlyChange", handleReadonlyChange);
    };
  }, [board, hide]);

  return {
    state,
    hide,
  };
};

export default useContextMenu;
