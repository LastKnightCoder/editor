/**
 * 画布上的文档卡：文档按版宽排好后整体缩小，底部渐隐；只读，双击 / ↵ 展开（外壳在 @tau/whiteboard）。
 * 纸面圆角加浮起阴影，与贴在画布上的富文本、图形拉开层次；手绘模式同样保留阴影。
 * 低缩放只画标题与骨架线；停靠展开时标「编辑中」并实时跟随正文。
 */

import { memo } from "react";
import type { Descendant } from "slate";
import { FileX2 } from "lucide-react";
import { cn } from "@tau/ui";
import {
  DOCUMENT_CARD_RADIUS,
  useBoard,
  useBoardState,
  useViewPort,
  type DocumentElement,
} from "@tau/whiteboard";
import useContentDocument from "@/hooks/useContentDocument";
import { CardContentPreview } from "@/features/cards/components/CardContentPreview";
import { DocumentPaper } from "./DocumentPaper";
import { DOCUMENT_PAPER_WIDTH } from "./layout";
import { useDocumentSource } from "./source";
import { useDocumentReaderPreference, useDocumentReaderState } from "./readerStore";
import { useDocumentHost } from "./DocumentHostContext";

/** 卡面只渲染首屏的块数，长文不必整篇挂只读编辑器 */
const PREVIEW_BLOCKS = 12;

const SKELETON_WIDTHS = [100, 92, 96, 70];

function Skeleton({ title }: { title?: string }) {
  return (
    <div className="flex size-full flex-col gap-3 p-4">
      {title ? (
        <div className="text-ink-1 line-clamp-2 text-[22px] font-semibold leading-tight">
          {title}
        </div>
      ) : null}
      {SKELETON_WIDTHS.map((width, index) => (
        <div key={index} className="bg-hover h-2.5 rounded-full" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

export const DocumentCard = memo(({ element }: { element: DocumentElement; sketch: boolean }) => {
  const board = useBoard();
  const { source, missing } = useDocumentSource(element);
  const { article } = useContentDocument(source?.contentId);
  const { zoom } = useViewPort();
  const { simplifiedRenderZoomThreshold } = useBoardState();
  const open = useDocumentReaderState(board, state => state.openId === element.id);
  // 收起动画一开始就去掉「编辑中」
  const closing = useDocumentReaderState(board, state => state.closing);
  const host = useDocumentHost();
  const preferred = useDocumentReaderPreference(state => state.mode);
  const mode = host.allowDock ? preferred : "center";

  const content = (article?.content as Descendant[] | undefined) ?? source?.content ?? [];
  const lowZoom = zoom < simplifiedRenderZoomThreshold;
  const paperWidth = DOCUMENT_PAPER_WIDTH[element.entityRef.kind];

  return (
    <div
      data-document-card={element.id}
      className={cn(
        "bg-surface shadow-paper relative size-full overflow-hidden",
        missing && "opacity-60"
      )}
      style={{ borderRadius: DOCUMENT_CARD_RADIUS }}
    >
      {missing ? (
        <div className="text-ink-3 flex size-full flex-col items-center justify-center gap-2 text-[13px]">
          <FileX2 className="size-5" strokeWidth={1.5} />
          {element.title ? `「${element.title}」已删除` : "文档已删除"}
        </div>
      ) : !source || lowZoom ? (
        <Skeleton title={source?.title ?? element.title} />
      ) : (
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ transform: `scale(${element.width / paperWidth})` }}
        >
          <DocumentPaper source={source}>
            <CardContentPreview content={content} blocks={PREVIEW_BLOCKS} />
          </DocumentPaper>
        </div>
      )}
      <div className="to-surface pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent" />
      {open && mode === "dock" && !closing && (
        <span
          data-document-badge
          className="bg-accent text-surface absolute right-2 top-2 rounded-[6px] px-1.5 text-[11px] leading-5"
        >
          编辑中
        </span>
      )}
      {/* 宿主叠加物不进展开替身（DocumentReader 克隆卡面时按此标记剔除） */}
      {host.cardAccessory && (
        <div data-document-accessory className="contents">
          {host.cardAccessory(element)}
        </div>
      )}
    </div>
  );
});
DocumentCard.displayName = "DocumentCard";
