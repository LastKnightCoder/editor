/**
 * 摘录卡面：左侧高亮色条、原文快照、笔记，底部来源条（来源标题 · 第 n 页）。
 * 点来源条回到原文：来源卡在板上时展开它并定位到这条标注（原高亮闪两下），不在板上时打开 PDF 阅读页；
 * 来源 PDF 已删除时来源条显示「原文已删除」，不能跳转。
 */

import { memo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMemoizedFn } from "ahooks";
import { CornerDownRight } from "lucide-react";
import { cn, toast } from "@tau/ui";
import {
  CANVAS_OVERLAY_ATTR,
  EXCERPT_CARD_RADIUS,
  EXCERPT_OPEN_SOURCE_EVENT,
  ViewPortTransforms,
  useBoard,
  type Board,
  type DocumentElement,
  type ExcerptElement,
} from "@tau/whiteboard";
import { getPdfById } from "@/commands";
import { openPage } from "@/services/page-navigation";
import { COLOR_SPECS } from "@/features/pdfs/reader/annotationModel";
import { EHighlightColor } from "@/types";
import { getDocumentReaderStore } from "./readerStore";

const swatchOf = (color?: string) =>
  COLOR_SPECS[(color as EHighlightColor) ?? EHighlightColor.Yellow]?.swatch ??
  COLOR_SPECS[EHighlightColor.Yellow].swatch;

/** 板上指向这份 PDF 的文档卡（优先有箭头连到摘录的那张） */
function findSourceCard(board: Board, excerpt: ExcerptElement): DocumentElement | null {
  const source = excerpt.source;
  if (source?.kind !== "pdf") return null;
  const cards: DocumentElement[] = [];
  const visit = (nodes: readonly { type: string; children?: unknown[] }[]) => {
    for (const node of nodes) {
      const ref = (node as DocumentElement).entityRef;
      if (node.type === "document" && ref?.kind === "pdf" && ref.id === source.pdfId)
        cards.push(node as DocumentElement);
      if (node.children) visit(node.children as typeof nodes);
    }
  };
  visit(board.children);
  const linked = cards.find(card =>
    board.children.some(
      arrow =>
        arrow.type === "arrow" &&
        arrow.source?.bindId === card.id &&
        arrow.target?.bindId === excerpt.id
    )
  );
  return linked ?? cards[0] ?? null;
}

export function openExcerptSource(board: Board, excerpt: ExcerptElement) {
  const source = excerpt.source;
  if (source?.kind !== "pdf") return;
  const card = findSourceCard(board, excerpt);
  if (!card) {
    openPage("pdf-detail", {
      pdfId: source.pdfId,
      ...(source.annotationId ? { annotation: source.annotationId } : {}),
    });
    return;
  }
  const store = getDocumentReaderStore(board);
  ViewPortTransforms.centerElementsIfNotInViewPort(board, [card]);
  board.select([card.id]);
  const focus = source.annotationId
    ? { annotationId: source.annotationId, nonce: Date.now() }
    : null;
  // 已经开着同一张卡：只换定位；开着别的或没开：交给阅读层打开
  if (store.getState().openId === card.id) store.setState({ focus });
  else if (store.getState().openId) store.setState({ openId: card.id, focus });
  else {
    store.setState({ focus });
    board.emit("tau.document.open", card.id);
  }
}

function useSourceAlive(excerpt: ExcerptElement) {
  const source = excerpt.source;
  const pdfId = source?.kind === "pdf" ? source.pdfId : 0;
  return useQuery({
    queryKey: ["whiteboard-excerpt-source", pdfId],
    queryFn: async () => (await getPdfById(pdfId).catch(() => null)) !== null,
    enabled: pdfId > 0,
    staleTime: 60_000,
  }).data;
}

export const ExcerptCard = memo(({ element }: { element: ExcerptElement; sketch: boolean }) => {
  const board = useBoard();
  const alive = useSourceAlive(element);
  const source = element.source;
  const open = useMemoizedFn(() => {
    if (alive === false) return toast.info("原文已删除");
    openExcerptSource(board, element);
  });

  return (
    <div
      className="bg-surface shadow-paper relative flex size-full overflow-hidden"
      style={{ borderRadius: EXCERPT_CARD_RADIUS }}
    >
      <span aria-hidden className={cn("w-1 shrink-0", swatchOf(element.color))} />
      <div className="flex min-w-0 flex-1 flex-col px-3.5 pt-3 pb-2">
        <p className="text-ink-1 line-clamp-5 min-h-0 flex-1 text-[14px] leading-relaxed">
          {element.quote || "（空摘录）"}
        </p>
        {element.note && (
          <p className="text-ink-2 border-line-1 mt-1.5 line-clamp-2 border-l-2 pl-2 text-[12.5px]">
            {element.note}
          </p>
        )}
        {source && (
          <button
            type="button"
            {...{ [CANVAS_OVERLAY_ATTR]: "" }}
            onClick={open}
            disabled={alive === false}
            className="text-ink-3 hover:text-accent-text disabled:hover:text-ink-3 mt-1.5 flex min-w-0 items-center gap-1 text-left text-[11.5px] disabled:cursor-default"
          >
            <CornerDownRight className="size-3 shrink-0" strokeWidth={1.75} />
            <span className="truncate">
              {alive === false
                ? "原文已删除"
                : [element.sourceTitle, source.kind === "pdf" ? `第 ${source.page} 页` : ""]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          </button>
        )}
      </div>
    </div>
  );
});
ExcerptCard.displayName = "ExcerptCard";

/** 画布层：属性条「回到原文」请求 */
export function ExcerptSourceLayer() {
  const board = useBoard();
  useEffect(() => {
    const onOpen = (id: string) => {
      const element = board.getElement(id);
      if (element?.type === "excerpt") openExcerptSource(board, element as ExcerptElement);
    };
    board.on(EXCERPT_OPEN_SOURCE_EVENT, onOpen);
    return () => board.off(EXCERPT_OPEN_SOURCE_EVENT, onOpen);
  }, [board]);
  return null;
}
