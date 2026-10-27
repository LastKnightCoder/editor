import { useEffect, useMemo, useSyncExternalStore } from "react";
import { MousePointer2 } from "lucide-react";
import {
  WHITEBOARD_PRESENCE_INTERVAL,
  type WhiteboardPeer,
  type WhiteboardPresence,
} from "@tau/collaboration";
import type Board from "../Board";
import type { PointerViewportStore } from "../context";
import { BoardUtil } from "../utils";
import type { BoardElement } from "../types";

export interface WhiteboardPresenceChannel {
  getPeers(): readonly WhiteboardPeer[];
  subscribePeers(listener: () => void): () => void;
  publishPresence(viewId: string, value: WhiteboardPresence | null): void;
}
export interface WhiteboardPresenceOptions {
  pageId: string;
  channel: WhiteboardPresenceChannel;
}
const empty: readonly WhiteboardPeer[] = [];
const getEmpty = () => empty;
const noSubscribe = () => () => {};

export function useWhiteboardPresence(
  board: Board,
  pointer: PointerViewportStore,
  options?: WhiteboardPresenceOptions
) {
  const peers = useSyncExternalStore(
    options?.channel.subscribePeers ?? noSubscribe,
    options?.channel.getPeers ?? getEmpty,
    getEmpty
  );
  const channel = options?.channel,
    pageId = options?.pageId;
  useEffect(() => {
    if (!channel || !pageId) return;
    const viewId = crypto.randomUUID();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let moving = false;
    let last = "";
    const publish = () => {
      timer = undefined;
      if (document.hidden || !document.hasFocus()) {
        channel.publishPresence(viewId, null);
        return;
      }
      const selection = (board.selection?.selectedElements ?? []).slice(0, 64).flatMap(selected => {
        const element = BoardUtil.getElementById(board, selected.id);
        const bounds = element && board.getBounds(element);
        if (!bounds || !element) return [];
        const { x, y, width, height } = element;
        const rotation = element.rotation ?? 0;
        const geometry = [x, y, width, height, rotation].every(Number.isFinite)
          ? { x, y, width, height, rotation }
          : undefined;
        return [{ id: selected.id, ...bounds, ...(moving && geometry ? { geometry } : {}) }];
      });
      const value: WhiteboardPresence = {
        pageId,
        cursor: pointer.getSnapshot(),
        selection,
        moving,
      };
      while (
        new TextEncoder().encode(JSON.stringify(value)).byteLength > 8_000 &&
        value.selection.length
      )
        value.selection.pop();
      const encoded = JSON.stringify(value);
      if (encoded !== last) {
        last = encoded;
        channel.publishPresence(viewId, value);
      }
    };
    const schedule = () => {
      if (!timer) timer = setTimeout(publish, WHITEBOARD_PRESENCE_INTERVAL);
    };
    const onMove = () => {
      moving = true;
      schedule();
    };
    const onEnd = () => {
      moving = false;
      schedule();
    };
    const focus = () => {
      last = "";
      schedule();
    };
    const blur = () => {
      clearTimeout(timer);
      timer = undefined;
      last = "";
      channel.publishPresence(viewId, null);
    };
    const visibility = () => (document.hidden ? blur() : focus());
    const unpointer = pointer.subscribe(schedule);
    board.on("selection:change", schedule);
    board.on("element:move", onMove);
    board.on("element:move-end", onEnd);
    board.on("value:change", schedule);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    schedule();
    return () => {
      clearTimeout(timer);
      unpointer();
      board.off("selection:change", schedule);
      board.off("element:move", onMove);
      board.off("element:move-end", onEnd);
      board.off("value:change", schedule);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
      channel.publishPresence(viewId, null);
    };
  }, [board, pointer, channel, pageId]);
  return useMemo(() => peers.filter(peer => peer.pageId === pageId), [peers, pageId]);
}

/** 远端手势只替换渲染投影，不改变本机模型、命中状态或撤销栈。 */
export function previewPeerElements(
  elements: BoardElement[],
  peers: readonly WhiteboardPeer[],
  localSelection: readonly BoardElement[]
): BoardElement[] {
  const local = new Set(localSelection.map(element => element.id));
  const geometry = new Map(
    peers
      .filter(peer => peer.moving)
      .flatMap(peer =>
        peer.selection
          .filter(rect => rect.geometry && !local.has(rect.id))
          .map(rect => [rect.id, rect.geometry!] as const)
      )
  );
  if (!geometry.size) return elements;
  const project = (items: BoardElement[]): BoardElement[] => {
    let changed = false;
    const projected = items.map(element => {
      const patch = geometry.get(element.id);
      const children = element.children && project(element.children);
      if (!patch && children === element.children) return element;
      changed = true;
      return { ...element, ...patch, ...(children ? { children } : {}) };
    });
    return changed ? projected : items;
  };
  return project(elements);
}

const colors = ["var(--tau-accent)", "var(--tau-tag-1)", "var(--tau-tag-3)", "var(--tau-tag-5)"];
export function WhiteboardPresenceOverlay({
  peers,
  zoom,
}: {
  peers: readonly WhiteboardPeer[];
  zoom: number;
}) {
  return (
    <g className="pointer-events-none" data-export-ignore="true" data-whiteboard-presence="true">
      {peers.map(peer => (
        <g key={peer.clientId} style={{ color: colors[peer.clientId % colors.length] }}>
          {peer.selection.map(rect => (
            <g key={rect.id}>
              <rect
                x={rect.minX}
                y={rect.minY}
                width={rect.maxX - rect.minX}
                height={rect.maxY - rect.minY}
                fill="none"
                stroke="currentColor"
                strokeWidth={2 / zoom}
                strokeDasharray={peer.moving ? `${6 / zoom} ${3 / zoom}` : undefined}
              />
              <text x={rect.minX} y={rect.minY - 5 / zoom} fontSize={12 / zoom} fill="currentColor">
                {peer.name}
                {peer.moving ? " · 正在移动" : " · 已选中"}
              </text>
            </g>
          ))}
          {peer.cursor && (
            <g transform={`translate(${peer.cursor.x} ${peer.cursor.y}) scale(${1 / zoom})`}>
              <MousePointer2
                x={-4}
                y={-3}
                size={24}
                fill="currentColor"
                stroke="var(--tau-bg-page)"
                strokeWidth="1.5"
              />
              <text x="18" y="26" fill="currentColor" fontSize="12">
                {peer.name}
              </text>
            </g>
          )}
        </g>
      ))}
    </g>
  );
}
