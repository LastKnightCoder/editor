/**
 * PDF 阅读页（过渡版）：一整张纸承载阅读器，面包屑「PDF / 文件名」。
 * 打开即记录打开时间并跳到上次读到的页；翻页防抖写回；首次打开时补生成缩略图（顺带记下页数）。
 * AI 对话随详情页正式迁移补上。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileX } from "lucide-react";
import { Button, Loading } from "@tau/ui";
import PdfEmbedViewer from "@/components/PdfEmbed";
import { readBinaryFile, recordPdfOpen, recordPdfPage } from "@/commands";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import type { PdfCitationTarget } from "@/utils/pdfCitation";
import { pdfTitle } from "../model";
import { usePdfDetail } from "../queries";
import { saveThumbnailFromBytes } from "../thumbnails";

const PAGE_KEY = "pdf-detail";
/** 翻页写回的防抖：连续翻页只落最后一页 */
const PAGE_SAVE_DELAY = 1500;

export function PdfDetailView() {
  const { pdfId } = usePageParams<{ pdfId: number }>();
  const { navigator } = usePage();
  const client = useQueryClient();
  const { pdf, loading } = usePdfDetail(pdfId);
  const title = pdf ? pdfTitle(pdf.fileName) : null;

  const invalidateLibrary = useCallback(
    () => client.invalidateQueries({ queryKey: ["pdfs", "library"] }),
    [client]
  );

  const breadcrumb = useMemo(
    () => (
      <span className="text-tau-meta flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => navigator.push("pdfs", {})}
          className="text-ink-2 hover:bg-hover hover:text-ink-1 shrink-0 rounded-[6px] px-1.5 py-0.5"
        >
          PDF
        </button>
        {title && (
          <>
            <span className="text-ink-3">/</span>
            <span className="text-ink-1 min-w-0 truncate font-medium">{title}</span>
          </>
        )}
      </span>
    ),
    [navigator, title]
  );
  usePageBreadcrumb(PAGE_KEY, breadcrumb);

  useEffect(() => {
    void recordPdfOpen(pdfId).then(invalidateLibrary);
  }, [pdfId, invalidateLibrary]);

  // 起始页只在首次拿到数据时取一次：之后 lastPage 随翻页变化，不能再触发跳转
  const [jumpTarget, setJumpTarget] = useState<PdfCitationTarget | null>(null);
  const startResolved = useRef(false);
  useEffect(() => {
    if (!pdf || startResolved.current) return;
    startResolved.current = true;
    if (pdf.lastPage && pdf.lastPage > 1) setJumpTarget({ pageNumber: pdf.lastPage });
  }, [pdf]);

  const pendingPage = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const flushPage = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (pendingPage.current === null) return;
    const page = pendingPage.current;
    pendingPage.current = null;
    void recordPdfPage(pdfId, page).then(invalidateLibrary);
  }, [pdfId, invalidateLibrary]);
  useEffect(() => flushPage, [flushPage]);

  const onPageChange = useCallback(
    (page: number) => {
      pendingPage.current = page;
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flushPage, PAGE_SAVE_DELAY);
    },
    [flushPage]
  );

  // 还没有缩略图（页数为空即从未生成）：文件就位后补一张
  const needsThumbnail = pdf ? pdf.pageCount == null : false;
  const onFileResolved = useCallback(
    (resolvedPath: string) => {
      if (!needsThumbnail) return;
      void readBinaryFile(resolvedPath)
        .then(bytes => saveThumbnailFromBytes(pdfId, bytes))
        .then(invalidateLibrary);
    },
    [needsThumbnail, pdfId, invalidateLibrary]
  );

  if (loading) return <Loading />;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        {pdf ? (
          <PdfEmbedViewer
            pdf={pdf}
            jumpTarget={jumpTarget}
            onPageChange={onPageChange}
            onFileResolved={onFileResolved}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <FileX className="text-ink-3 size-7" strokeWidth={1.5} />
            <p className="text-ink-1 text-[15px] font-semibold">这份 PDF 已不存在</p>
            <p className="text-tau-meta text-ink-2">可能已在别处被删除。</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => navigator.push("pdfs", {})}
            >
              回到 PDF 列表
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
