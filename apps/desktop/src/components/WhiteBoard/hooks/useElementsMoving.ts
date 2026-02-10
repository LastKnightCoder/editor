import { useEffect, useRef, useSyncExternalStore } from "react";
import { Board, BoardElement } from "../types";

export interface MovingElementsStore {
  subscribe: (listener: () => void) => () => void;
  getBoardMoving: () => boolean;
  getElementMoving: (elementId: string) => boolean;
}

class MovingElementsStoreImpl implements MovingElementsStore {
  private movingElementIds: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getBoardMoving = () => this.movingElementIds.size > 0;

  getElementMoving = (elementId: string) =>
    this.movingElementIds.has(elementId);

  setMovingElements = (movingElements: BoardElement[]) => {
    const nextMovingIds = new Set(movingElements.map((element) => element.id));
    if (this.isSameSet(this.movingElementIds, nextMovingIds)) {
      return;
    }
    this.movingElementIds = nextMovingIds;
    this.emitChange();
  };

  clearMovingElements = () => {
    if (this.movingElementIds.size === 0) {
      return;
    }
    this.movingElementIds.clear();
    this.emitChange();
  };

  private emitChange = () => {
    this.listeners.forEach((listener) => listener());
  };

  private isSameSet = (source: Set<string>, target: Set<string>) => {
    if (source.size !== target.size) {
      return false;
    }
    for (const id of source) {
      if (!target.has(id)) {
        return false;
      }
    }
    return true;
  };
}

export const useElementsMoving = (board: Board) => {
  const movingStoreRef = useRef<MovingElementsStoreImpl>(
    new MovingElementsStoreImpl(),
  );

  useEffect(() => {
    const movingStore = movingStoreRef.current;
    const onMovingChange = (movingElements: BoardElement[]) => {
      movingStore.setMovingElements(movingElements);
    };
    const onMovingEnd = () => {
      movingStore.clearMovingElements();
    };

    board.on("element:move", onMovingChange);
    board.on("element:move-end", onMovingEnd);

    return () => {
      board.off("element:move", onMovingChange);
      board.off("element:move-end", onMovingEnd);
      movingStore.clearMovingElements();
    };
  }, [board]);

  const isMoving = useSyncExternalStore(
    movingStoreRef.current.subscribe,
    movingStoreRef.current.getBoardMoving,
  );

  return {
    isMoving,
    movingStore: movingStoreRef.current as MovingElementsStore,
  };
};
