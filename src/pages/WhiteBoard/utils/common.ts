import { EventHandler, Selection, Board } from "../types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 判断两个矩形是否相交
export const isRectIntersect = (rect1: Rect, rect2: Rect) => {
  return !(
    rect1.x + rect1.width < rect2.x ||
    rect1.x > rect2.x + rect2.width ||
    rect1.y + rect1.height < rect2.y ||
    rect1.y > rect2.y + rect2.height
  );
}

export const selectAreaToRect = (selectArea: Selection['selectArea']) => {
  if (!selectArea) return null;
  return {
    x: Math.min(selectArea.anchor.x, selectArea.focus.x),
    y: Math.min(selectArea.anchor.y, selectArea.focus.y),
    width: Math.abs(selectArea.anchor.x - selectArea.focus.x),
    height: Math.abs(selectArea.anchor.y - selectArea.focus.y)
  }
}

export const isValid = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

export const executeSequence = (fns: EventHandler[], event: Event, board: Board) => {
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    const result = fn(event, board);
    if (result === false) return;
    if (event.defaultPrevented) return;
  }
}