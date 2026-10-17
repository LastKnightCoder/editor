/**
 * 画布里嵌入的白板卡片：引用整块白板（whiteBoardId），显示缩略图 + 标题 + 页数，
 * 双击打开白板详情（上次停留的页）；在白板详情里双击时沿跳转链前进（trail 参数，见 features/whiteboards/navigation.ts），
 * 目标已在链上则截回那一级。沿链回来时这张卡片被定位并闪一下（element:flash）。
 *
 * 旧元素只记了页 id（whiteBoardContentId）：能反查到所属白板时按该白板显示，双击打开白板详情并定位到这一页；
 * 反查不到（独立页）才打开单页画布。
 */

import { memo, useContext, useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Presentation } from "lucide-react";
import { cn, toast } from "@tau/ui";

import { Board } from "@tau/whiteboard";
import { SKETCH_MEDIA_FRAME } from "@tau/whiteboard";
import { useSketch } from "@tau/whiteboard";
import { SketchRect as SketchRect } from "@tau/whiteboard";
import { WhiteBoardElement } from "@tau/whiteboard";
import LocalImage from "@/components/LocalImage";
import { DesktopPageSchematic as PageSchematic } from "../../DesktopPageSchematic";
import { openPage } from "@/services/page-navigation";
import { useWhiteboardDetail, useWhiteboardOwner } from "@/features/whiteboards/queries";
import { displayTitle, enterBoard, formatTrail, toItem } from "@/features/whiteboards/model";
import { WhiteboardNavContext, requestReveal } from "@/features/whiteboards/navigation";
import { handTextClass } from "@tau/whiteboard";

interface WhiteBoardCardProps {
  board: Board;
  element: WhiteBoardElement;
}

// 固定高度常量
export const WHITEBOARD_CARD_HEIGHT = 80;

/** 画布纸底 + 点阵（示意图的底，同白板列表卡片） */
const CANVAS_BG =
  "bg-surface-hover bg-[radial-gradient(color-mix(in_srgb,var(--tau-ink-1)_13%,transparent)_1px,transparent_1.2px)] bg-[length:10px_10px]";

const WhiteBoardCard = memo((props: WhiteBoardCardProps) => {
  const { element, board } = props;
  const sketch = useSketch(element);
  const nav = useContext(WhiteboardNavContext);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let timer = 0;
    const onFlash = (id: string) => {
      if (id !== element.id) return;
      setFlash(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFlash(false), 1400);
    };
    board.on("element:flash", onFlash);
    return () => {
      board.off("element:flash", onFlash);
      window.clearTimeout(timer);
    };
  }, [board, element.id]);
  const { x, y, width, name } = element;
  const height = WHITEBOARD_CARD_HEIGHT;

  const boardId = element.whiteBoardId ?? null;
  const legacyPageId = boardId === null ? (element.whiteBoardContentId ?? null) : null;
  const detail = useWhiteboardDetail(boardId);
  const { owner, loading: ownerLoading } = useWhiteboardOwner(legacyPageId);
  const whiteBoard = boardId !== null ? detail.board : owner;
  const loading = boardId !== null ? detail.loading && !detail.error : ownerLoading;
  const item = whiteBoard ? toItem(whiteBoard) : null;
  // 引用的整块白板已删除；旧的独立页仍可打开
  const missing = !loading && !item && legacyPageId === null;

  const [failedCover, setFailedCover] = useState<string>();
  const cover = item?.snapshot && item.snapshot !== failedCover ? item.snapshot : "";
  const firstPage = item?.pages[0];

  const handleDoubleClick = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (loading) return;
    try {
      if (item) {
        const next = nav
          ? enterBoard(
              nav.trail,
              { boardId: nav.boardId, pageId: nav.pageId, elementId: element.id },
              item.id
            )
          : null;
        if (next?.back) requestReveal(next.back.pageId, next.back.elementId);
        const page = next?.back?.pageId ?? legacyPageId;
        openPage("whiteboard-detail", {
          id: item.id,
          ...(page !== null ? { page } : {}),
          ...(next ? { trail: formatTrail(next.trail) } : {}),
        });
      } else if (legacyPageId !== null) {
        openPage("whiteboard-content", { id: legacyPageId });
      } else {
        toast.error("白板已删除");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开白板失败");
    }
  });

  const title = item ? displayTitle(item) : name || "未命名白板";
  const meta = loading
    ? "加载中…"
    : missing
      ? "白板已删除"
      : item
        ? `${item.pages.length} 页 · ${item.elementCount} 个元素`
        : "独立画布";

  return (
    <>
      <foreignObject x={x} y={y} width={width} height={height} className="overflow-visible">
        <div
          onDoubleClick={handleDoubleClick}
          title="双击打开白板"
          className={cn(
            "bg-surface border-line-1 flex size-full cursor-move items-center gap-2.5 overflow-hidden rounded-[12px] border p-2",
            "ease-tau-out transition-[box-shadow,border-color] duration-300",
            flash
              ? "border-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--tau-accent)_28%,transparent)]"
              : sketch.enabled
                ? "border-transparent"
                : "shadow-card hover:shadow-lift",
            handTextClass(sketch),
            missing && "opacity-60"
          )}
        >
          <div
            className={cn(
              "relative aspect-[16/10] h-full shrink-0 overflow-hidden rounded-[8px] shadow-[inset_0_0_0_1px_var(--tau-line-2)]",
              CANVAS_BG
            )}
          >
            {cover ? (
              <LocalImage
                url={cover}
                className="absolute inset-0 size-full select-none object-cover"
                draggable={false}
                onLoadError={() => setFailedCover(cover)}
              />
            ) : firstPage && firstPage.elementCount > 0 ? (
              <PageSchematic
                elements={firstPage.elements}
                aspect={16 / 10}
                className="absolute inset-0 size-full"
              />
            ) : (
              <Presentation
                className="text-ink-3 absolute inset-0 m-auto size-5"
                strokeWidth={1.5}
              />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-ink-1 truncate text-[14px] font-semibold leading-[1.4]">
              {title}
            </span>
            <span className="text-ink-3 truncate text-[12px] tabular-nums">{meta}</span>
          </div>
        </div>
      </foreignObject>
      {/* 定位闪烁是交互反馈，保持普通描边 */}
      {sketch.enabled && !flash && (
        <SketchRect
          x={x}
          y={y}
          width={width}
          height={height}
          radius={12}
          stroke={SKETCH_MEDIA_FRAME}
          strokeWidth={1.5}
          level={sketch.level}
          seed={sketch.seed}
        />
      )}
    </>
  );
});

export default WhiteBoardCard;
