/**
 * 白板阅读纸里的 PDF：独立阅读器（同项目里的 PDF 条目，没有对话），从「上次读到的页」打开，
 * 翻页节流写回 pdfs.last_page，白板上同一份 PDF 的卡面跟着换页。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { recordPdfPage } from "@/commands";
import type { Pdf, PdfAnnotation } from "@/types";
import { syncLastPage, usePdfLastPage } from "../lastPage";
import { useDatabaseReady } from "../queries";
import { PdfReader } from "./PdfReader";
import {
  initialReadingPosition,
  useReadingPositions,
  type ReadingPosition,
} from "./readingPosition";

const PAGE_SAVE_DELAY = 300;

export function WhiteboardPdfReader({
  pdf,
  annotationId,
  prepareSendToBoard,
  onDragToBoard,
}: {
  pdf: Pdf;
  /** 打开后定位到某条标注（摘录回到原文） */
  annotationId?: number | null;
  prepareSendToBoard?: () => ((record: PdfAnnotation) => void) | null;
  onDragToBoard?: (record: PdfAnnotation, event: React.DragEvent) => void;
}) {
  const client = useQueryClient();
  const { database } = useDatabaseReady();
  const { page } = usePdfLastPage(pdf);
  const [initialPosition] = useState(() =>
    annotationId ? null : initialReadingPosition(pdf.id, page)
  );
  const pending = useRef<ReadingPosition | null>(null);
  const saved = useRef(page);
  const timer = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const position = pending.current;
    if (!position) return;
    pending.current = null;
    useReadingPositions.getState().save(pdf.id, position);
    if (position.page === saved.current) return;
    saved.current = position.page;
    syncLastPage(client, database, pdf.id, position.page);
    void recordPdfPage(pdf.id, position.page);
  }, [client, database, pdf.id]);
  useEffect(() => flush, [flush]);

  const onPositionChange = useCallback(
    (position: ReadingPosition) => {
      pending.current = position;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, PAGE_SAVE_DELAY);
    },
    [flush]
  );

  return (
    <PdfReader
      pdf={pdf}
      initialPosition={initialPosition}
      jumpAnnotationId={annotationId ?? null}
      onPositionChange={onPositionChange}
      prepareSendToBoard={prepareSendToBoard}
      onDragToBoard={onDragToBoard}
    />
  );
}
