import { useEffect, useMemo, useRef } from "react";
import type { Descendant } from "slate";

import { Editor } from "@tau/editor/src";
import { PanContainer } from "../../components/PanContainer";
import type { CardDetailResponse } from "../../types";
import { useMobileTheme } from "../../hooks/useMobileTheme";
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
    <PanContainer
      open={props.open}
      initialState={props.panelState}
      enabledStates={["normal", "full"]}
      heights={{ normal: 0.72 }}
      onRequestClose={props.onClose}
      onStateChange={(nextState) => {
        if (nextState === "normal" || nextState === "full") {
          props.onPanelStateChange?.(nextState);
        }
      }}
      scrollRef={scrollRef}
      containerClassName="bg-white dark:bg-neutral-950"
    >
      {(timeline) => (
        <>
          <div
            className="flex justify-center py-3"
            style={{ opacity: 1 - timeline.segmentProgress.normalToFull }}
          >
            <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-neutral-600" />
          </div>

          <header
            className={`flex items-center justify-between px-4 ${
              timeline.state === "full" ? "mobile-safe-top-gap pb-3" : "pb-2"
            }`}
          >
            <div
              className="flex items-center gap-3 text-xs text-gray-400 dark:text-neutral-500"
              style={{
                opacity: 0.35 + timeline.overallProgress * 0.65,
                transform: `translateY(${(1 - timeline.overallProgress) * 12}px)`,
              }}
            >
              <span>{formatTimeLabel(props.cardDetail?.updateTime ?? 0)}</span>
              <span className="text-gray-200 dark:text-neutral-700">|</span>
              <span>{wordCount} 字</span>
            </div>
          </header>

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
        </>
      )}
    </PanContainer>
  );
}

export default CardPreviewSheet;
