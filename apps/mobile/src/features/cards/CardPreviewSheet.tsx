import { useMemo, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { Descendant } from "slate";

import { Editor } from "@tau/editor/src";
import type { CardDetailResponse } from "../../types";
import { useMobileTheme } from "../../hooks/useMobileTheme";
import { mobileCardPreviewExtensions } from "./editorExtensions";
import { shouldPreventBackgroundTouchMove } from "./touchMoveGuard";
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
  fullscreen: boolean;
  loading: boolean;
  cardId: number | null;
  cardDetail: CardDetailResponse | null;
  initialScrollTop?: number;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onScrollTopChange?: (scrollTop: number) => void;
};

export function CardPreviewSheet(props: CardPreviewSheetProps) {
  const { theme } = useMobileTheme();
  const sheetRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const content = useMemo(
    () => normalizeEditorContent(props.cardDetail?.content),
    [props.cardDetail?.content],
  );

  // 优先使用数据库存储的字数，为 0 时用前端计算兜底
  const wordCount = useMemo(() => {
    const dbCount = props.cardDetail?.count ?? 0;
    if (dbCount > 0) return dbCount;
    if (
      !Array.isArray(props.cardDetail?.content) ||
      props.cardDetail.content.length === 0
    )
      return 0;
    return getContentLength(props.cardDetail.content as Descendant[]);
  }, [props.cardDetail?.count, props.cardDetail?.content]);

  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (props.open) {
      setShouldRender(true);
    } else if (shouldRender) {
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [props.open, shouldRender]);

  // 禁止背景滚动（避免 body fixed + scrollTo 在移动端产生回弹）
  useEffect(() => {
    if (!props.open) return;

    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const prevBodyOverflow = bodyStyle.overflow;
    const prevBodyOverscroll = bodyStyle.overscrollBehavior;
    const prevHtmlOverflow = htmlStyle.overflow;
    const prevHtmlOverscroll = htmlStyle.overscrollBehavior;

    bodyStyle.overflow = "hidden";
    bodyStyle.overscrollBehavior = "none";
    htmlStyle.overflow = "hidden";
    htmlStyle.overscrollBehavior = "none";

    const preventBackgroundTouchMove = (event: TouchEvent) => {
      if (
        !shouldPreventBackgroundTouchMove({
          target: event.target,
          sheet: sheetRef.current,
        })
      ) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener("touchmove", preventBackgroundTouchMove, {
      passive: false,
    });

    return () => {
      document.removeEventListener("touchmove", preventBackgroundTouchMove);
      bodyStyle.overflow = prevBodyOverflow;
      bodyStyle.overscrollBehavior = prevBodyOverscroll;
      htmlStyle.overflow = prevHtmlOverflow;
      htmlStyle.overscrollBehavior = prevHtmlOverscroll;
    };
  }, [props.open]);

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
  }, [props.cardId, props.initialScrollTop, props.open, props.fullscreen]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* 遮罩层 */}
      <button
        type="button"
        aria-label="关闭预览"
        className={`absolute inset-0 bg-black/50 dark:bg-black/70 ${props.open ? "mask-enter" : "mask-exit"}`}
        onClick={props.onClose}
      />

      {/* 底部抽屉 */}
      <section
        ref={sheetRef}
        className={`absolute left-0 right-0 flex flex-col bg-white dark:bg-neutral-950 ${
          props.fullscreen
            ? "top-0 bottom-0 rounded-none"
            : "bottom-0 max-h-[85dvh] rounded-t-2xl"
        } ${props.open ? "sheet-enter" : "sheet-exit"}`}
      >
        {/* 拖拽指示条 */}
        {!props.fullscreen && (
          <div className="flex justify-center py-3">
            <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-neutral-600" />
          </div>
        )}

        {/* 头部 */}
        <header
          className={`flex items-center justify-between px-4 ${props.fullscreen ? "mobile-safe-top-gap pb-3" : "pb-2"}`}
        >
          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-neutral-500">
            <span>{formatTimeLabel(props.cardDetail?.updateTime ?? 0)}</span>
            <span className="text-gray-200 dark:text-neutral-700">|</span>
            <span>{wordCount} 字</span>
          </div>

          {/* 放大/缩小按钮 */}
          <button
            type="button"
            onClick={props.onToggleFullscreen}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors active:bg-gray-100 dark:text-neutral-500 dark:active:bg-neutral-800"
            aria-label={props.fullscreen ? "缩小" : "放大"}
          >
            {props.fullscreen ? (
              <Minimize2 size={18} aria-hidden="true" />
            ) : (
              <Maximize2 size={18} aria-hidden="true" />
            )}
          </button>
        </header>

        {/* 内容区域 */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe pt-3"
          onScroll={(event) => {
            props.onScrollTopChange?.(event.currentTarget.scrollTop);
          }}
        >
          {props.loading ? (
            <div className="space-y-3 py-2">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
              <div className="h-4 w-4/6 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
            </div>
          ) : props.cardDetail ? (
            <div className="space-y-3">
              {/* 标签 */}
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

              {/* 关联 */}
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

              {/* 编辑器内容 */}
              <div className="pt-1">
                <Editor
                  key={props.cardDetail.id}
                  initValue={content}
                  readonly
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
        </div>
      </section>
    </div>
  );
}

export default CardPreviewSheet;
