/**
 * 画布上的文档卡：文档按版宽排好后整体缩小，底部渐隐；只读，双击 / ↵ 展开（外壳在 @tau/whiteboard）。
 * 纸面圆角加浮起阴影，与贴在画布上的富文本、图形拉开层次；手绘模式同样保留阴影。
 * 低缩放只画标题与骨架线；停靠展开时标「编辑中」并实时跟随正文。
 */

import { useDocumentReaderI18n } from "../../reader.i18n";
import { memo } from "react";
import { FileX2 } from "lucide-react";
import { cn, ErrorBoundary } from "@tau/ui";
import {
  DOCUMENT_CARD_RADIUS,
  useBoard,
  useBoardState,
  useZoom,
  type DocumentElement,
} from "@tau/whiteboard";
import ContentEditor from "@/components/ContentEditor";
import { DocumentPaper } from "./DocumentPaper";
import { PdfFace } from "./PdfFace";
import { DOCUMENT_PAPER_WIDTH } from "./layout";
import { useDocumentSource } from "./source";
import { useDocumentReaderPreference, useDocumentReaderState } from "./readerStore";
import { useDocumentHost } from "./DocumentHostContext";

const SKELETON_WIDTHS = [100, 92, 96, 70];

function Skeleton({ title }: { title?: string }) {
  return (
    <div className="flex size-full flex-col gap-3 p-4">
      {title ? (
        <div className="text-ink-1 line-clamp-2 text-[22px] leading-tight font-semibold">
          {title}
        </div>
      ) : null}
      {SKELETON_WIDTHS.map((width, index) => (
        <div key={index} className="bg-hover h-2.5 rounded-full" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

function DeletedDocument({ title }: { title?: string }) {
  const { t } = useDocumentReaderI18n();
  return <>{title ? t("deleted.named", { title }) : t("deleted")}</>;
}
function EditingBadge() {
  const { t } = useDocumentReaderI18n();
  return (
    <span
      data-document-badge
      className="bg-accent text-surface absolute top-2 right-2 rounded-[6px] px-1.5 text-[11px] leading-5"
    >
      {t("editing")}
    </span>
  );
}

export const DocumentCard = memo(({ element }: { element: DocumentElement; sketch: boolean }) => {
  const board = useBoard();
  const { source, missing } = useDocumentSource(element);
  const zoom = useZoom();
  const { simplifiedRenderZoomThreshold } = useBoardState();
  const open = useDocumentReaderState(board, state => state.openId === element.id);
  // 收起动画一开始就去掉「编辑中」
  const closing = useDocumentReaderState(board, state => state.closing);
  const host = useDocumentHost();
  const preferred = useDocumentReaderPreference(state => state.mode);
  const mode = host.allowDock ? preferred : "center";

  const lowZoom = zoom < simplifiedRenderZoomThreshold;
  const paperWidth = DOCUMENT_PAPER_WIDTH[source?.kind ?? element.entityRef?.kind ?? "article"];
  // PDF 卡面自带纸叠与阴影，外框不裁切、不投影
  const pdf = !missing && !!source?.pdf;

  return (
    <div
      data-document-card={element.id}
      className={cn(
        "relative size-full",
        !pdf && "bg-surface shadow-paper overflow-hidden",
        missing && "opacity-60"
      )}
      style={{ borderRadius: pdf ? undefined : DOCUMENT_CARD_RADIUS }}
    >
      {missing ? (
        <div className="text-ink-3 flex size-full flex-col items-center justify-center gap-2 text-[13px]">
          <FileX2 className="size-5" strokeWidth={1.5} />
          <DeletedDocument title={element.title} />
        </div>
      ) : source?.pdf ? (
        <PdfFace element={element} pdf={source.pdf} zoom={zoom} lowZoom={lowZoom} />
      ) : !source || lowZoom ? (
        <Skeleton title={source?.title ?? element.title} />
      ) : (
        <div
          className="pointer-events-none absolute top-0 left-0 origin-top-left"
          style={{ transform: `scale(${element.width / paperWidth})` }}
        >
          <DocumentPaper source={source}>
            <ErrorBoundary>
              <ContentEditor
                contentId={source.contentId}
                readonly
                className="pointer-events-none overflow-hidden py-0.5 *:pointer-events-none"
              />
            </ErrorBoundary>
          </DocumentPaper>
        </div>
      )}
      {!pdf && (
        <div className="to-surface pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent" />
      )}
      {open && mode === "dock" && !closing && <EditingBadge />}
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
