/**
 * PDF 文档卡的卡面：上次读到的那一页（真实页面位图），背后两层纸叠，右下角页码；
 * 有笔记的标注在页边留一枚小标记，颜色取高亮色。
 * 页码是全局记忆（pdfs.last_page），PDF 阅读页、白板阅读纸、卡面翻页（属性条上一页 / 下一页、[ ]）共用，
 * 同一份 PDF 在白板上的所有卡面一起换页。卡片不在画面里时不渲染位图。
 */

import { useEffect, useRef, useState } from "react";
import { FileWarning } from "lucide-react";
import { cn, toast } from "@tau/ui";
import { useQueryClient } from "@tanstack/react-query";
import { bindDatabaseCommands } from "@/services/command-context";
import { getPdfById, recordPdfPage } from "@/commands";
import { useDatabaseReady } from "@/features/pdfs/queries";
import {
  DOCUMENT_CARD_RADIUS,
  DOCUMENT_TURN_PAGE_EVENT,
  useBoard,
  type DocumentElement,
} from "@tau/whiteboard";
import type { Pdf } from "@/types";
import { getPdfPageCount, usePdfPage } from "@/features/pdfs/pdfPage";
import { lastPageKey, syncLastPage, usePdfLastPage } from "@/features/pdfs/lastPage";
import { usePdfAnnotationList } from "@/features/pdfs/reader/data";
import {
  COLOR_SPECS,
  annotationColor,
  annotationPage,
  annotationRect,
  hasNote,
} from "@/features/pdfs/reader/annotationModel";

/** A4 宽（PDF 点）：标注坐标按它换算到卡面 */
const PAGE_POINTS = 595;
/** 位图按卡片在屏幕上的宽度渲染，再乘设备像素比 */
const pixelWidth = (element: DocumentElement, zoom: number) =>
  element.width * zoom * (typeof devicePixelRatio === "number" ? devicePixelRatio : 1);

/** 卡片在画面里（含一屏余量）才渲染位图 */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setInView(true);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: "100%",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, inView] as const;
}

function MarginPins({ pdf, page, width }: { pdf: Pdf; page: number; width: number }) {
  const annotations = usePdfAnnotationList(pdf.id);
  const scale = width / PAGE_POINTS;
  const pins = (annotations ?? []).filter(
    record => annotationPage(record) === page && hasNote(record)
  );
  return (
    <>
      {pins.map(record => {
        const rect = annotationRect(record);
        if (!rect) return null;
        return (
          <span
            key={record.id}
            className={cn(
              "absolute right-1 size-2 rounded-full ring-2 ring-[var(--tau-surface)]",
              COLOR_SPECS[annotationColor(record)].swatch
            )}
            style={{ top: Math.max(4, rect.y * scale) }}
          />
        );
      })}
    </>
  );
}

export function PdfFace({
  element,
  pdf,
  zoom,
  lowZoom,
}: {
  element: DocumentElement;
  pdf: Pdf;
  zoom: number;
  lowZoom: boolean;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const { page: lastPage } = usePdfLastPage(pdf);
  const image = usePdfPage(pdf, lastPage, pixelWidth(element, zoom), inView && !lowZoom);
  const page = image?.page ?? lastPage;
  const pageCount = image?.pageCount ?? pdf.pageCount;
  const radius = Math.max(3, DOCUMENT_CARD_RADIUS / 4);

  return (
    <div ref={ref} data-pdf-face className="relative size-full">
      {/* 纸叠：两层错开的纸边，表示这是一整份文档 */}
      <span
        aria-hidden
        className="bg-surface border-line-1 absolute inset-0 translate-x-[6px] translate-y-[6px] border"
        style={{ borderRadius: radius }}
      />
      <span
        aria-hidden
        className="bg-surface border-line-1 absolute inset-0 translate-x-[3px] translate-y-[3px] border"
        style={{ borderRadius: radius }}
      />
      <div
        className="bg-surface shadow-paper absolute inset-0 overflow-hidden bg-white"
        style={{ borderRadius: radius }}
      >
        {image?.url && !lowZoom ? (
          <img
            src={image.url}
            alt=""
            draggable={false}
            className="pointer-events-none size-full object-cover object-top select-none"
          />
        ) : image?.error ? (
          <div className="text-ink-3 flex size-full flex-col items-center justify-center gap-2 text-[13px]">
            <FileWarning className="size-5" strokeWidth={1.5} />
            文件读取失败
          </div>
        ) : (
          <div className="flex size-full flex-col gap-3 p-4">
            <div className="text-ink-1 line-clamp-3 text-[20px] leading-tight font-semibold">
              {element.title || pdf.fileName}
            </div>
            {[96, 88, 92, 70, 84].map((width, index) => (
              <div
                key={index}
                className="bg-hover h-2 rounded-full"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        )}
        {!lowZoom && <MarginPins pdf={pdf} page={page} width={element.width} />}
      </div>
      <span
        data-document-badge
        className="bg-surface/90 border-line-1 text-ink-2 absolute right-2 bottom-2 rounded-full border px-2 text-[11px] leading-5 tabular-nums"
      >
        {pageCount ? `${page} / ${pageCount}` : `第 ${page} 页`}
      </span>
    </div>
  );
}

/** 画布层：PDF 卡翻页请求（[ ]、属性条）→ 写回全局「上次读到的页」 */
export function PdfPageTurnLayer() {
  const board = useBoard();
  const client = useQueryClient();
  const { database } = useDatabaseReady();
  useEffect(() => {
    let active = true;
    const commands = bindDatabaseCommands(
      { getPdfById, recordPdfPage },
      { databaseName: database }
    );
    const onTurn = async ({ id, delta }: { id: string; delta: number }) => {
      const element = board.getElement(id) as DocumentElement | undefined;
      const ref = element?.entityRef;
      if (ref?.kind !== "pdf") return;
      const pdf = await commands.getPdfById(ref.id).catch(() => null);
      if (!pdf || !active) return;
      const pageCount = pdf.pageCount || (await getPdfPageCount(database, pdf).catch(() => null));
      if (!active) return;
      if (!pageCount) return toast.error("无法读取 PDF 页数");
      const current =
        client.getQueryData<number>(lastPageKey(database, pdf.id)) ?? pdf.lastPage ?? 1;
      const next = Math.max(1, Math.min(pageCount, Math.min(current, pageCount) + delta));
      if (next === current) return;
      syncLastPage(client, database, pdf.id, next);
      await commands.recordPdfPage(pdf.id, next).catch(() => toast.error("页码保存失败"));
    };
    board.on(DOCUMENT_TURN_PAGE_EVENT, onTurn);
    return () => {
      active = false;
      board.off(DOCUMENT_TURN_PAGE_EVENT, onTurn);
    };
  }, [board, client, database]);
  return null;
}
