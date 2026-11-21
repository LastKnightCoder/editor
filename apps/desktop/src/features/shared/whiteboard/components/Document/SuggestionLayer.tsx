/**
 * 长出相关：选中文档卡按 R 或点属性条「相关」，卡旁浮出最多 3 张虚框建议，每张写明相关原因。
 * - 建议只是浮层，不写入白板；点一张就地放成文档卡并连线，选中不变，可以接着点下一张；
 * - 建议放在卡片右、左、下三侧中没被占的那一侧；
 * - 取消选中、选中别的、画布被改动到那张卡、Esc 时收起。
 * 根节点带 CANVAS_OVERLAY_ATTR：建议上的指针不归画布。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Plus } from "lucide-react";
import { toast } from "@tau/ui";
import {
  CANVAS_OVERLAY_ATTR,
  DOCUMENT_RELATED_EVENT,
  useBoard,
  useSelection,
  useViewPort,
  type BoardElement,
  type DocumentElement,
} from "@tau/whiteboard";
import { EntityKindIcon } from "@/components/EntityKind/EntityKindIcon";
import { ENTITY_KIND_META } from "@/components/EntityPicker/meta";
import { DesktopEditorOverlayDismiss } from "@/services/editorOverlayDismiss";
import { insertDocuments, placedKeys } from "./insert";
import { loadRelated, type RelatedItem } from "./related";
import { prefersReducedMotion } from "./morph";

const MAX_SUGGESTIONS = 3;
/** 建议卡的画布尺寸：随画布缩放，和文档卡一样是画布上的东西 */
const SUGGESTION = { width: 240, height: 84, gap: 12 };
const SIDE_GAP = 72;
const CLEARANCE = 20;

type Side = "right" | "left" | "below";
interface Placement {
  side: Side;
  x: number;
  y: number;
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: BoardElement) =>
  a.x < b.x + b.width + CLEARANCE &&
  a.x + a.width + CLEARANCE > b.x &&
  a.y < b.y + b.height + CLEARANCE &&
  a.y + a.height + CLEARANCE > b.y;

/** 右、左、下三侧取第一个不和其他元素重叠的；都占了就放右侧 */
export function pickSide(
  card: BoardElement,
  count: number,
  others: readonly BoardElement[]
): Placement {
  const height = count * SUGGESTION.height + (count - 1) * SUGGESTION.gap;
  const top = card.y + card.height / 2 - height / 2;
  const spots: Placement[] = [
    { side: "right", x: card.x + card.width + SIDE_GAP, y: top },
    { side: "left", x: card.x - SIDE_GAP - SUGGESTION.width, y: top },
    { side: "below", x: card.x + card.width / 2 + 24, y: card.y + card.height + 48 },
  ];
  const free = (spot: Placement) =>
    !others.some(
      other =>
        other.id !== card.id &&
        other.type !== "arrow" &&
        overlaps({ x: spot.x, y: spot.y, width: SUGGESTION.width, height }, other)
    );
  return spots.find(free) ?? spots[0];
}

interface Open {
  card: DocumentElement;
  items: RelatedItem[];
  placement: Placement;
}

function Suggestions({ open, onPlaced }: { open: Open; onPlaced(item: RelatedItem): void }) {
  const board = useBoard();
  const viewPort = useViewPort();
  const busy = useRef(false);
  const { card, placement, items } = open;

  const toScreen = (x: number, y: number) => ({
    left: (x - viewPort.minX) * viewPort.zoom,
    top: (y - viewPort.minY) * viewPort.zoom,
  });
  const boxOf = (index: number) => ({
    x: placement.x,
    y: placement.y + index * (SUGGESTION.height + SUGGESTION.gap),
  });

  const place = useMemoizedFn(async (item: RelatedItem, index: number) => {
    if (busy.current) return;
    busy.current = true;
    const { x, y } = boxOf(index);
    try {
      const [placed] = await insertDocuments(board, [item], {
        at: { x, y: y + SUGGESTION.height / 2 },
        linkFrom: card.id,
        keepSelection: true,
      });
      if (!placed) return;
      board.flashElement(placed.id);
      onPlaced(item);
    } catch {
      // 失败提示已给出，建议保留以便重试
    } finally {
      busy.current = false;
    }
  });

  const origin = (() => {
    if (placement.side === "below") return { x: card.x + card.width / 2, y: card.y + card.height };
    return {
      x: placement.side === "left" ? card.x : card.x + card.width,
      y: card.y + card.height / 2,
    };
  })();
  const from = toScreen(origin.x, origin.y);
  const scale = viewPort.zoom;
  const reduced = prefersReducedMotion();

  return (
    <div
      {...{ [CANVAS_OVERLAY_ATTR]: "" }}
      className="pointer-events-none absolute inset-0 z-[7] overflow-hidden"
    >
      <svg className="absolute inset-0 size-full overflow-visible">
        {items.map((item, index) => {
          const box = boxOf(index);
          const end = toScreen(
            placement.side === "left" ? box.x + SUGGESTION.width : box.x,
            box.y + SUGGESTION.height / 2
          );
          const d =
            placement.side === "below"
              ? `M${from.left},${from.top} C${from.left},${end.top} ${from.left},${end.top} ${end.left},${end.top}`
              : `M${from.left},${from.top} C${(from.left + end.left) / 2},${from.top} ${(from.left + end.left) / 2},${end.top} ${end.left},${end.top}`;
          return (
            <path
              key={item.key}
              d={d}
              fill="none"
              stroke="var(--tau-ink-3)"
              strokeOpacity={0.6}
              strokeDasharray="3 5"
              strokeWidth={1.25}
            />
          );
        })}
      </svg>
      {items.map((item, index) => {
        const box = boxOf(index);
        const position = toScreen(box.x, box.y);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => void place(item, index)}
            className="bg-surface border-line-1 hover:border-accent group hover:shadow-card pointer-events-auto absolute flex origin-top-left flex-col rounded-[10px] border border-dashed px-3 pt-2 pb-2.5 text-left transition-[border-color,box-shadow] duration-150 hover:border-solid"
            style={{
              left: position.left,
              top: position.top,
              width: SUGGESTION.width,
              height: SUGGESTION.height,
              transform: `scale(${scale})`,
              animation: reduced
                ? "fadeIn 120ms ease-out both"
                : `suggestion-in 360ms var(--tau-ease-out) ${index * 50}ms both`,
            }}
          >
            <span className="text-ink-3 flex items-center gap-1.5 text-[11.5px]">
              <EntityKindIcon
                entityRef={item.entityRef}
                fallback={ENTITY_KIND_META[item.kind]}
                className="size-3 shrink-0"
                strokeWidth={1.75}
              />
              <span className="truncate">
                {ENTITY_KIND_META[item.kind].label} · {item.reason}
              </span>
              <span className="text-accent-text ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <Plus className="size-3" strokeWidth={2} />
                放入
              </span>
            </span>
            <span className="text-ink-1 mt-1 line-clamp-1 text-[14px] leading-snug font-semibold">
              {item.title || "无标题"}
            </span>
            {item.summary && (
              <span className="text-ink-3 mt-0.5 truncate text-[12px]">{item.summary}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 画布层：监听长出相关请求；选中变化或卡片移动时收起 */
export function SuggestionLayer() {
  const board = useBoard();
  const selection = useSelection();
  const [open, setOpen] = useState<Open | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const onRequest = async (id: string) => {
      const request = ++requestRef.current;
      const card = board.getElement(id);
      if (card?.type !== "document") return;
      const ref = (card as DocumentElement).entityRef;
      const placed = placedKeys(board);
      const items = ref
        ? (await loadRelated(ref).catch(() => [])).filter(item => !placed.has(item.key))
        : [];
      if (request !== requestRef.current) return;
      if (items.length === 0) {
        setOpen(null);
        toast.info("没有更多相关的内容了");
        return;
      }
      const shown = items.slice(0, MAX_SUGGESTIONS);
      setOpen({
        card: card as DocumentElement,
        items: shown,
        placement: pickSide(card, shown.length, board.children),
      });
    };
    board.on(DOCUMENT_RELATED_EVENT, onRequest);
    return () => board.off(DOCUMENT_RELATED_EVENT, onRequest);
  }, [board]);

  const selectedId = useMemo(() => {
    const selected = selection?.selectedElements ?? [];
    return selected.length === 1 ? selected[0].id : null;
  }, [selection]);

  // 选中换了，或卡片被移动 / 删除：建议的位置失效，收起
  const card = open ? board.getElement(open.card.id) : undefined;
  const stale =
    !!open &&
    (selectedId !== open.card.id ||
      !card ||
      card.x !== open.card.x ||
      card.y !== open.card.y ||
      card.width !== open.card.width ||
      card.height !== open.card.height);
  useEffect(() => {
    if (stale) setOpen(null);
  }, [stale]);

  const close = useMemoizedFn(() => {
    requestRef.current++;
    setOpen(null);
  });

  // 放下一张后其余建议按新的板面重新找一侧，免得压在刚放下的卡上
  const placed = useMemoizedFn((item: RelatedItem) => {
    setOpen(current => {
      if (!current) return null;
      const items = current.items.filter(other => other.key !== item.key);
      if (items.length === 0) return null;
      return {
        ...current,
        items,
        placement: pickSide(current.card, items.length, board.children),
      };
    });
  });

  if (!open || stale) return null;
  return (
    <>
      <DesktopEditorOverlayDismiss open onDismiss={close} />
      <Suggestions open={open} onPlaced={placed} />
    </>
  );
}
