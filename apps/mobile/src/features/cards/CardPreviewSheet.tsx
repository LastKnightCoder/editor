import { useMemo, useEffect, useState, type ComponentProps } from "react";
import { wordsCount } from "words-count";
import type { Descendant } from "slate";

import { Editor } from "@tau/editor/src";
import type { CardDetailResponse } from "../../types";
import { mobileCardPreviewExtensions } from "./editorExtensions";

const EMPTY_EDITOR_CONTENT: EditorDocument = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

type EditorDocument = ComponentProps<typeof Editor>["initValue"];

function normalizeTimestamp(value: number): number {
  return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
}

function formatTimeLabel(value: number): string {
  if (!value) {
    return "--";
  }
  return new Date(normalizeTimestamp(value)).toLocaleString();
}

function normalizeEditorContent(
  content: unknown[] | undefined,
): EditorDocument {
  if (!Array.isArray(content) || content.length === 0) {
    return EMPTY_EDITOR_CONTENT;
  }
  return content as EditorDocument;
}

// 与桌面端 getContentLength 保持一致的字数计算逻辑
function dfs(nodes: Descendant[], visit: (node: Descendant) => void) {
  for (const node of nodes) {
    visit(node);
    if ("children" in node && Array.isArray(node.children)) {
      dfs(node.children as Descendant[], visit);
    }
  }
}

function getContentLength(value: Descendant[]): number {
  let length = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dfs(value, (node: any) => {
    if (node.type === "formatted") {
      length += wordsCount(node.text ?? "");
    } else if (node.type === "code-block") {
      length += wordsCount(node.code ?? "");
    } else if (node.type === "inline-math" || node.type === "block-math") {
      length += wordsCount(node.tex ?? "");
    } else if (node.type === "tabs") {
      const tabs = node.tabsContent ?? [];
      const notCurrentTabs = tabs.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tab: any) => tab.key !== node.activeKey,
      );
      for (const tab of notCurrentTabs) {
        length += getContentLength(tab.content);
      }
    } else if (node.type === "mermaid") {
      length += wordsCount(node.chart ?? "");
    } else if (node.type === "html-block") {
      length += wordsCount(node.html ?? "");
    } else if (node.type === "custom-block") {
      length += wordsCount(node.content ?? "");
    } else if (node.type === "tikz") {
      length += wordsCount(node.content ?? "");
    } else if (node.type === "list-item") {
      if (node.isFold && node.allContent) {
        length += getContentLength(node.allContent.slice(1));
      }
    }
  });

  return length;
}

function IconExpand() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function IconMinimize() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

type CardPreviewSheetProps = {
  open: boolean;
  fullscreen: boolean;
  loading: boolean;
  cardId: number | null;
  cardDetail: CardDetailResponse | null;
  onClose: () => void;
  onToggleFullscreen: () => void;
};

export function CardPreviewSheet(props: CardPreviewSheetProps) {
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

  // 禁止背景滚动
  useEffect(() => {
    if (props.open) {
      // 保存当前滚动位置
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";

      return () => {
        // 恢复滚动
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [props.open]);

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
        className={`absolute left-0 right-0 flex flex-col bg-white dark:bg-gray-900 ${
          props.fullscreen
            ? "top-0 bottom-0 rounded-none"
            : "bottom-0 max-h-[85dvh] rounded-t-2xl"
        } ${props.open ? "sheet-enter" : "sheet-exit"}`}
      >
        {/* 拖拽指示条 */}
        {!props.fullscreen && (
          <div className="flex justify-center py-3">
            <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        )}

        {/* 头部 */}
        <header
          className={`flex items-center justify-between px-4 ${props.fullscreen ? "py-3 pt-safe" : "pb-2"}`}
        >
          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
            <span>{formatTimeLabel(props.cardDetail?.updateTime ?? 0)}</span>
            <span className="text-gray-200 dark:text-gray-700">|</span>
            <span>{wordCount} 字</span>
          </div>

          {/* 放大/缩小按钮 */}
          <button
            type="button"
            onClick={props.onToggleFullscreen}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors active:bg-gray-100 dark:text-gray-500 dark:active:bg-gray-800"
            aria-label={props.fullscreen ? "缩小" : "放大"}
          >
            {props.fullscreen ? <IconMinimize /> : <IconExpand />}
          </button>
        </header>

        {/* 内容区域 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe pt-3">
          {props.loading ? (
            <div className="space-y-3 py-2">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-4/6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ) : props.cardDetail ? (
            <div className="space-y-3">
              {/* 标签 */}
              {props.cardDetail.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {props.cardDetail.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 关联 */}
              {props.cardDetail.links.length > 0 && (
                <div className="rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-800/60">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    关联
                  </p>
                  <div className="space-y-1">
                    {props.cardDetail.links.slice(0, 6).map((link) => (
                      <p
                        key={link}
                        className="truncate text-xs text-gray-600 dark:text-gray-300"
                        title={link}
                      >
                        {link}
                      </p>
                    ))}
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
