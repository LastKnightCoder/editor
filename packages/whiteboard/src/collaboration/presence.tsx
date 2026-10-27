import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  MEMBER_INK,
  memberColor,
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
        return [{ id: selected.id, ...bounds, ...(geometry ? { geometry } : {}) }];
      });
      const value: WhiteboardPresence = {
        pageId,
        cursor: pointer.getSnapshot(),
        selection,
        moving,
        version: board.document?.presenceVersion?.(),
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
  hasVersion: (version: string) => boolean = () => true
): BoardElement[] {
  const geometry = new Map(
    peers
      .filter(peer => peer.moving || (peer.version && !hasVersion(peer.version)))
      .flatMap(peer =>
        peer.selection.filter(rect => rect.geometry).map(rect => [rect.id, rect.geometry!] as const)
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

/** 选框只从同一帧的元素投影取位置，不能独立使用远端坐标抢跑。 */
export function alignPeerSelections(
  board: Pick<Board, "getBounds">,
  elements: readonly BoardElement[],
  peers: readonly WhiteboardPeer[]
): WhiteboardPeer[] {
  const byId = new Map<string, BoardElement>();
  const collect = (items: readonly BoardElement[]) =>
    items.forEach(element => {
      byId.set(element.id, element);
      if (element.children) collect(element.children);
    });
  collect(elements);
  return peers.map(peer => ({
    ...peer,
    selection: peer.selection.flatMap(selected => {
      const element = byId.get(selected.id);
      const bounds = element && board.getBounds(element);
      return bounds ? [{ ...selected, ...bounds }] : [];
    }),
  }));
}

// 指针尖端位于 (0,0)，外描边保证在任意画布底色上可辨。
const POINTER_PATH = "M0 0 L0 16.5 L4.6 12.3 L7.6 19 L10.4 17.8 L7.5 11.3 L13.6 11.3 Z";
const LABEL_WIDTH = 168;
const LABEL_HEIGHT = 22;

function PeerLabel({ name, x, y, corner }: { name: string; x: number; y: number; corner: string }) {
  return (
    <foreignObject x={x} y={y} width={LABEL_WIDTH} height={LABEL_HEIGHT} overflow="visible">
      <div
        className="text-tau-tiny shadow-card inline-block max-w-full truncate bg-current px-2 py-0.5 leading-[18px] font-medium whitespace-nowrap"
        style={{ borderRadius: corner }}
      >
        <span style={{ color: MEMBER_INK }}>{name}</span>
      </div>
    </foreignObject>
  );
}

function selectionUnion(selection: WhiteboardPeer["selection"]) {
  return selection.reduce(
    (union, rect) => ({
      minX: Math.min(union.minX, rect.minX),
      minY: Math.min(union.minY, rect.minY),
    }),
    { minX: Infinity, minY: Infinity }
  );
}

/** 成员色由连接身份派生，与正文协作的头像、光标、选区同色。 */
export function WhiteboardPresenceOverlay({
  peers,
  zoom,
}: {
  peers: readonly WhiteboardPeer[];
  zoom: number;
}) {
  const unit = 1 / zoom;
  return (
    <g className="pointer-events-none" data-export-ignore="true" data-whiteboard-presence="true">
      {peers.map(peer => {
        const union = peer.selection.length ? selectionUnion(peer.selection) : null;
        return (
          <g
            key={peer.clientId}
            data-peer={peer.userId}
            style={{ color: memberColor(peer.userId) }}
          >
            {peer.selection.map(rect => (
              <rect
                key={rect.id}
                x={rect.minX}
                y={rect.minY}
                width={rect.maxX - rect.minX}
                height={rect.maxY - rect.minY}
                fill="currentColor"
                fillOpacity={0.06}
                stroke="currentColor"
                strokeWidth={1.5 * unit}
                strokeDasharray={peer.moving ? `${6 * unit} ${3 * unit}` : undefined}
              />
            ))}
            {union && !peer.cursor && (
              <g transform={`translate(${union.minX} ${union.minY}) scale(${unit})`}>
                <PeerLabel name={peer.name} x={0} y={-LABEL_HEIGHT - 2} corner="6px 6px 6px 2px" />
              </g>
            )}
            {peer.cursor && (
              // 平移按发送间隔补间，抹平节流造成的跳动；缩放随本机视口立即生效。
              <g
                data-peer-cursor="true"
                style={{
                  transform: `translate(${peer.cursor.x}px, ${peer.cursor.y}px)`,
                  transition: `transform ${WHITEBOARD_PRESENCE_INTERVAL}ms linear`,
                }}
              >
                <g transform={`scale(${unit})`}>
                  <path
                    d={POINTER_PATH}
                    fill="currentColor"
                    stroke={MEMBER_INK}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                  <PeerLabel name={peer.name} x={12} y={18} corner="2px 6px 6px 6px" />
                </g>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
