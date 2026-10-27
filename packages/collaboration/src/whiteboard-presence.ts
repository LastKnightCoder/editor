import type { WhiteboardGeometry } from "./whiteboard-types";
/** 视图临时状态使用画布坐标，不进入文档、磁盘或撤销历史。 */
export interface WhiteboardPresence {
  pageId: string;
  cursor: { x: number; y: number } | null;
  selection: {
    id: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    geometry?: WhiteboardGeometry;
  }[];
  moving: boolean;
  /** 松手后的预览保留到接收端包含该文档状态。 */
  version?: string;
}

export interface WhiteboardPeer extends WhiteboardPresence {
  clientId: number;
  name: string;
}

export const WHITEBOARD_PRESENCE_INTERVAL = 120;

export function readWhiteboardPresence(value: unknown): WhiteboardPresence | null {
  if (!value || typeof value !== "object") return null;
  const state = value as WhiteboardPresence;
  const coordinate = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e9;
  if (
    typeof state.pageId !== "string" ||
    state.pageId.length > 200 ||
    typeof state.moving !== "boolean" ||
    (state.version !== undefined &&
      (typeof state.version !== "string" ||
        state.version.length > 4096 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(state.version))) ||
    !Array.isArray(state.selection) ||
    state.selection.length > 64 ||
    (state.cursor !== null &&
      (!state.cursor || !coordinate(state.cursor.x) || !coordinate(state.cursor.y)))
  )
    return null;
  if (
    state.selection.some(
      rect =>
        !rect ||
        typeof rect.id !== "string" ||
        rect.id.length > 200 ||
        ![rect.minX, rect.minY, rect.maxX, rect.maxY].every(coordinate) ||
        rect.maxX < rect.minX ||
        rect.maxY < rect.minY ||
        (rect.geometry &&
          (![
            rect.geometry.x,
            rect.geometry.y,
            rect.geometry.width,
            rect.geometry.height,
            rect.geometry.rotation,
          ].every(coordinate) ||
            rect.geometry.width < 0 ||
            rect.geometry.height < 0))
    )
  )
    return null;
  return {
    pageId: state.pageId,
    cursor: state.cursor && { x: state.cursor.x, y: state.cursor.y },
    moving: state.moving,
    ...(state.version ? { version: state.version } : {}),
    selection: state.selection.map(({ id, minX, minY, maxX, maxY, geometry }) => ({
      id,
      minX,
      minY,
      maxX,
      maxY,
      ...(geometry
        ? {
            geometry: {
              x: geometry.x,
              y: geometry.y,
              width: geometry.width,
              height: geometry.height,
              rotation: geometry.rotation,
            },
          }
        : {}),
    })),
  };
}
