/**
 * PDF 阅读页（D-070 方案 B）：一整张纸——左面板（目录 / 页面 / 标注 / 书签）+ 阅读区 + 纸内右栏
 * 的 AI 对话（这份 PDF 专属，Ctrl/⌘+J 在本页开合它，壳层停靠栏让位）。
 * 面包屑「[左面板开关] PDF / 文件名」；进入收起全局侧栏、离开还原。
 * 打开即记录打开时间并还原到上次的阅读位置（页码进库、页内位置记在本机）；阅读位置防抖写回，
 * 离开（含保活隐藏）时立即写回；文件就位后补生成缩略图（顺带记下页数）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileX, PanelLeft } from "lucide-react";
import { Button, IconButton, Loading, ResizeHandle, cn } from "@tau/ui";
import { readBinaryFile, recordPdfOpen, recordPdfPage } from "@/commands";
import { useOwnAssist } from "@/app/assistOwner";
import { useSidebarCollapsedWhile } from "@/app/useSidebarCollapsedWhile";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import type { Pdf } from "@/types";
import type { PdfCitationTarget } from "@/utils/pdfCitation";
import PdfChatPanel, { type PdfChatPanelHandle } from "../chat/PdfChatPanel";
import { pdfTitle } from "../model";
import { detailKey, useDatabaseReady, usePdfDetail } from "../queries";
import type { PdfQuote } from "../reader/annotationModel";
import { usePdfIndex } from "../reader/data";
import { PdfReaderView } from "../reader/PdfReader";
import { CHAT_DEFAULT_W, CHAT_MAX_W, CHAT_MIN_W, useReaderPrefs } from "../reader/readerPrefs";
import { usePdfFile } from "../reader/usePdfFile";
import {
  initialReadingPosition,
  useReadingPositions,
  type ReadingPosition,
} from "../reader/readingPosition";
import { saveThumbnailFromBytes } from "../thumbnails";

const PAGE_KEY = "pdf-detail";
/** 阅读位置写回的防抖：连续滚动只落最后的位置 */
const PAGE_SAVE_DELAY = 1500;

export function PdfDetailView() {
  const { pdfId, annotation } = usePageParams<{ pdfId: number; annotation?: number }>();
  const { navigator } = usePage();
  const { pdf, loading } = usePdfDetail(pdfId);
  const title = pdf ? pdfTitle(pdf.fileName) : null;
  const leftOpen = useReaderPrefs(s => s.leftOpen);
  const toggleLeft = useReaderPrefs(s => s.toggleLeft);
  useSidebarCollapsedWhile(true);

  const breadcrumb = useMemo(
    () => (
      <span className="text-tau-meta flex min-w-0 items-center gap-1.5">
        {pdf && (
          <IconButton
            title={leftOpen ? "收起左面板" : "打开左面板"}
            aria-label="左面板"
            aria-pressed={leftOpen}
            onClick={toggleLeft}
            className={cn("size-7", leftOpen && "bg-selected text-accent-text hover:bg-selected")}
          >
            <PanelLeft size={16} strokeWidth={1.75} />
          </IconButton>
        )}
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
    [navigator, title, pdf, leftOpen, toggleLeft]
  );
  usePageBreadcrumb(PAGE_KEY, breadcrumb);

  if (loading) return <Loading />;

  return (
    <div className="flex h-full min-h-0 w-full flex-col px-4 pb-4 pt-1">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 overflow-hidden">
        {pdf ? (
          <PdfReaderPage pdf={pdf} annotationId={annotation ?? null} />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
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

function PdfReaderPage({ pdf, annotationId }: { pdf: Pdf; annotationId: number | null }) {
  const client = useQueryClient();
  const { database } = useDatabaseReady();
  const file = usePdfFile(pdf);
  const index = usePdfIndex(pdf, file.resolvedPath);

  const invalidateLibrary = useCallback(
    () => client.invalidateQueries({ queryKey: ["pdfs", "library"] }),
    [client]
  );

  useEffect(() => {
    void recordPdfOpen(pdf.id).then(invalidateLibrary);
  }, [pdf.id, invalidateLibrary]);

  const [jumpTarget, setJumpTarget] = useState<PdfCitationTarget | null>(null);
  // 起始位置只取一次（之后 lastPage 随阅读变化）；指定了标注时由标注定位
  const [initialPosition] = useState(() =>
    annotationId ? null : initialReadingPosition(pdf.id, pdf.lastPage)
  );

  const pendingPosition = useRef<ReadingPosition | null>(null);
  const savedPage = useRef(pdf.lastPage ?? null);
  const saveTimer = useRef<number | null>(null);
  const flushPosition = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const position = pendingPosition.current;
    if (position === null) return;
    pendingPosition.current = null;
    useReadingPositions.getState().save(pdf.id, position);
    if (position.page === savedPage.current) return;
    savedPage.current = position.page;
    // 详情缓存不自动刷新（staleTime: Infinity），同步改掉，免得下次打开用旧页码
    client.setQueryData<Pdf | null>(detailKey(database, pdf.id), prev =>
      prev ? { ...prev, lastPage: position.page } : prev
    );
    void recordPdfPage(pdf.id, position.page).then(invalidateLibrary);
  }, [pdf.id, client, database, invalidateLibrary]);
  // 卸载或保活隐藏（effect 停驻）时立即写回
  useEffect(() => flushPosition, [flushPosition]);

  const onPositionChange = useCallback(
    (position: ReadingPosition) => {
      pendingPosition.current = position;
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flushPosition, PAGE_SAVE_DELAY);
    },
    [flushPosition]
  );

  // 还没有缩略图（页数为空即从未生成）：文件就位后补一张
  const needsThumbnail = pdf.pageCount == null;
  useEffect(() => {
    if (!needsThumbnail || !file.resolvedPath) return;
    void readBinaryFile(file.resolvedPath)
      .then(bytes => saveThumbnailFromBytes(pdf.id, bytes))
      .then(invalidateLibrary);
  }, [needsThumbnail, file.resolvedPath, pdf.id, invalidateLibrary]);

  /* ───────── 对话栏 ───────── */

  const chatOpen = useReaderPrefs(s => s.chatOpen);
  const setChatOpen = useReaderPrefs(s => s.setChatOpen);
  const chatWidth = useReaderPrefs(s => s.chatWidth);
  const setChatWidth = useReaderPrefs(s => s.setChatWidth);
  const [resizing, setResizing] = useState(false);
  // 首次打开才挂载，之后收起只隐藏（保留进行中的回答与滚动位置）
  const [chatMounted, setChatMounted] = useState(chatOpen);
  if (chatOpen && !chatMounted) setChatMounted(true);
  const chatRef = useRef<PdfChatPanelHandle>(null);
  const pendingQuote = useRef<PdfQuote | null>(null);

  const toggleChat = useCallback(
    () => setChatOpen(!useReaderPrefs.getState().chatOpen),
    [setChatOpen]
  );
  useOwnAssist(PAGE_KEY, toggleChat);

  const onAskAI = useCallback(
    (quote: PdfQuote) => {
      setChatOpen(true);
      if (chatRef.current) chatRef.current.attachQuote(quote);
      else pendingQuote.current = quote;
    },
    [setChatOpen]
  );
  // 对话栏刚挂载：补上挂载前带来的引用
  const onChatRef = useCallback((handle: PdfChatPanelHandle | null) => {
    chatRef.current = handle;
    if (handle && pendingQuote.current) {
      handle.attachQuote(pendingQuote.current);
      pendingQuote.current = null;
    }
  }, []);

  const onCitationNavigate = useCallback(
    (target: PdfCitationTarget) => setJumpTarget({ ...target }),
    []
  );

  return (
    <>
      <PdfReaderView
        pdf={pdf}
        file={file}
        index={index}
        jumpTarget={jumpTarget}
        jumpAnnotationId={annotationId}
        initialPosition={initialPosition}
        onPositionChange={onPositionChange}
        onAskAI={onAskAI}
        onOpenChat={chatOpen ? undefined : () => setChatOpen(true)}
      />
      {chatMounted && (
        <section
          aria-label="AI 对话"
          aria-hidden={!chatOpen}
          className={cn(
            "relative shrink-0 overflow-hidden",
            !resizing && "ease-tau-out transition-[width,opacity] duration-[220ms]",
            chatOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          style={{ width: chatOpen ? chatWidth : 0 }}
        >
          {/* 左缘拖宽：对话栏在热区右边，向左拖变宽 */}
          <ResizeHandle
            value={chatWidth}
            min={CHAT_MIN_W}
            max={CHAT_MAX_W}
            defaultValue={CHAT_DEFAULT_W}
            onChange={setChatWidth}
            onActiveChange={setResizing}
            side="right"
            label="AI 对话栏宽度"
            className="absolute bottom-4 left-0 top-4 z-10"
          />
          <div className="h-full py-1.5 pl-2" style={{ width: chatWidth }}>
            <PdfChatPanel
              ref={onChatRef}
              pdf={pdf}
              mainDbName={database}
              indexStatus={index.status}
              indexPreparing={index.preparing}
              onEnsureIndex={() => void index.ensure().catch(() => undefined)}
              onCitationNavigate={onCitationNavigate}
              onClose={() => setChatOpen(false)}
            />
          </div>
        </section>
      )}
    </>
  );
}
