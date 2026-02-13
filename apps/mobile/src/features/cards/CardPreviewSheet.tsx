import { useEffect, useMemo, useRef } from "react";
import type { Descendant } from "slate";

import { Editor, type EditorRef } from "@tau/editor/src";
import { SnapSheet } from "../../components/SnapSheet";
import type { CardDetailResponse } from "../../types";
import { useMobileTheme } from "../../hooks/useMobileTheme";
import { useEditContent } from "../../hooks/useEditContent";
import { MobileEditorBottomToolbar } from "./editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "./editorToolbar/useMobileEditorToolbarController";
import { mobileCardPreviewExtensions } from "./editorExtensions";
import { getContentLength, normalizeEditorContent } from "./editorContentUtils";

function normalizeTimestamp(value: number): number {
  return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
}

function formatTimeLabel(value: number): string {
  if (!value) {
    return "--";
  }
  return new Date(normalizeTimestamp(value)).toLocaleString();
}

type CardPreviewSheetProps = {
  open: boolean;
  panelState: "normal" | "full";
  loading: boolean;
  cardId: number | null;
  cardDetail: CardDetailResponse | null;
  initialScrollTop?: number;
  onClose: () => void;
  onPanelStateChange?: (state: "normal" | "full") => void;
  onScrollTopChange?: (scrollTop: number) => void;
};

export function CardPreviewSheet(props: CardPreviewSheetProps) {
  const { theme } = useMobileTheme();
  const editorRef = useRef<EditorRef | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousOpenRef = useRef(props.open);
  const editingContentId =
    props.open && props.cardDetail?.contentId
      ? props.cardDetail.contentId
      : undefined;
  const {
    content,
    syncVersion,
    loading: contentLoading,
    saving: contentSaving,
    error: contentError,
    throttleHandleEditorContentChange,
    flushNow,
    retryLastFailed,
  } = useEditContent(editingContentId);
  const mergedContent = useMemo(() => {
    if (editingContentId && Array.isArray(content) && content.length > 0) {
      return normalizeEditorContent(content);
    }
    return normalizeEditorContent(props.cardDetail?.content);
  }, [content, editingContentId, props.cardDetail?.content]);

  // 优先使用数据库存储的字数，为 0 时用前端计算兜底
  const wordCount = useMemo(() => {
    const dbCount = props.cardDetail?.count ?? 0;
    if (dbCount > 0) return dbCount;
    if (!Array.isArray(mergedContent) || mergedContent.length === 0) return 0;
    return getContentLength(mergedContent as Descendant[]);
  }, [props.cardDetail?.count, mergedContent]);
  const toolbarController = useMobileEditorToolbarController({
    editorRef,
  });

  useEffect(() => {
    if (previousOpenRef.current && !props.open) {
      void flushNow();
    }
    previousOpenRef.current = props.open;
  }, [flushNow, props.open]);

  useEffect(() => {
    return () => {
      void flushNow();
    };
  }, [flushNow]);

  useEffect(() => {
    if (!props.open) return;
    const target = scrollRef.current;
    if (!target) return;
    const nextScrollTop =
      typeof props.initialScrollTop === "number" && props.initialScrollTop > 0
        ? props.initialScrollTop
        : 0;
    const frame = window.requestAnimationFrame(() => {
      target.scrollTop = nextScrollTop;
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [props.cardId, props.initialScrollTop, props.open, props.panelState]);

  return (
    <SnapSheet
      open={props.open}
      state={props.panelState}
      states={["normal", "full"]}
      normalHeight={0.72}
      onClose={props.onClose}
      onStateChange={(nextState) => {
        if (nextState === "normal" || nextState === "full") {
          props.onPanelStateChange?.(nextState);
        }
      }}
      scrollRef={scrollRef}
      containerClassName="bg-white dark:bg-neutral-950"
    >
      <>
        <SnapSheet.Handle />

        <header
          className={`flex items-center justify-between px-4 ${
            props.panelState === "full" ? "mobile-safe-top-gap pb-3" : "pb-2"
          }`}
        >
          <div
            className="flex items-center gap-3 text-xs text-gray-400 dark:text-neutral-500"
            style={{
              opacity: "calc(0.35 + var(--pan-progress-overall) * 0.65)",
              transform:
                "translateY(calc((1 - var(--pan-progress-overall)) * 12px))",
            }}
          >
            <span>{formatTimeLabel(props.cardDetail?.updateTime ?? 0)}</span>
            <span className="text-gray-200 dark:text-neutral-700">|</span>
            <span>{wordCount} 字</span>
            <span className="text-gray-200 dark:text-neutral-700">|</span>
            {contentSaving ? (
              <span>保存中...</span>
            ) : contentError ? (
              <button
                type="button"
                onClick={() => {
                  void retryLastFailed();
                }}
                className="rounded px-1.5 py-0.5 text-red-500 active:bg-red-50 dark:text-red-400 dark:active:bg-red-900/20"
              >
                保存失败，重试
              </button>
            ) : (
              <span>自动保存已开启</span>
            )}
          </div>
        </header>

        <SnapSheet.FixedFooterScroll
          ref={scrollRef}
          className="px-4 pt-3"
          onScroll={(event) => {
            props.onScrollTopChange?.(event.currentTarget.scrollTop);
          }}
        >
          {props.loading || contentLoading ? (
            <div className="space-y-3 py-2">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
              <div className="h-4 w-4/6 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
            </div>
          ) : props.cardDetail ? (
            <div className="space-y-3">
              {props.cardDetail.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {props.cardDetail.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {props.cardDetail.links.length > 0 && (
                <div className="rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-neutral-900">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    关联
                  </p>
                  <div className="space-y-1">
                    {props.cardDetail.links.slice(0, 6).map((link) => {
                      const linkText = String(link);
                      return (
                        <p
                          key={linkText}
                          className="truncate text-xs text-gray-600 dark:text-neutral-300"
                          title={linkText}
                        >
                          {linkText}
                        </p>
                      );
                    })}
                    {props.cardDetail.links.length > 6 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        +{props.cardDetail.links.length - 6} 个关联
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-1">
                <Editor
                  ref={editorRef}
                  key={`card-preview-edit-${props.cardDetail.contentId}-${syncVersion}`}
                  initValue={mergedContent}
                  onFocus={toolbarController.handleEditorFocus}
                  onBlur={toolbarController.handleEditorBlur}
                  onChange={(value) => {
                    throttleHandleEditorContentChange(value);
                    toolbarController.syncSelection();
                  }}
                  readonly={false}
                  theme={theme}
                  extensions={mobileCardPreviewExtensions}
                />
              </div>
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                无可预览内容
              </p>
            </div>
          )}
        </SnapSheet.FixedFooterScroll>
        <MobileEditorBottomToolbar controller={toolbarController} />
      </>
    </SnapSheet>
  );
}

export default CardPreviewSheet;
