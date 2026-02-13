import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, MoreVertical } from "lucide-react";
import type { Descendant } from "slate";
import { Editor, type EditorRef } from "@tau/editor/src";
import { CardListItem } from "../../types";
import { useMobileTheme } from "../../hooks/useMobileTheme";
import MobileConfirmDialog from "../../components/MobileConfirmDialog";
import { mobileCardPreviewExtensions } from "./editorExtensions";
import { CARD_CATEGORY_OPTIONS, type KnownCardCategory } from "./cardCategory";
import { useReadonlyContentSync } from "../../hooks/useReadonlyContentSync";

function formatTimeDisplay(ts: number): string {
  if (!ts) return "";
  const normalized = ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const date = new Date(normalized);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;

  if (isToday) {
    return `今天 ${time}`;
  } else if (isYesterday) {
    return `昨天 ${time}`;
  } else if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

interface CardItemProps {
  item: CardListItem;
  onPreviewCard: (cardId: number) => void;
  onUpdateCardCategory?: (
    cardId: number,
    category: KnownCardCategory,
  ) => Promise<void> | void;
  onDeleteCard?: (cardId: number) => Promise<void> | void;
}

type ActionSheetMode = "none" | "menu" | "category";
type SheetMode = Exclude<ActionSheetMode, "none">;

const CardItem = memo(
  ({
    item,
    onPreviewCard,
    onUpdateCardCategory,
    onDeleteCard,
  }: CardItemProps) => {
    const { theme } = useMobileTheme();
    const editorRef = useRef<EditorRef | null>(null);
    const closeDeleteConfirmTimerRef = useRef<number | null>(null);
    const [actionSheetMode, setActionSheetMode] =
      useState<ActionSheetMode>("none");
    const [sheetRenderMode, setSheetRenderMode] = useState<SheetMode>("menu");
    const [shouldRenderSheet, setShouldRenderSheet] = useState(false);
    const [sheetActionPending, setSheetActionPending] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false);
    const actionSheetOpen = actionSheetMode !== "none";

    const editorContent = useMemo(() => {
      if (Array.isArray(item.content) && item.content.length > 0) {
        return item.content.slice(0, 3);
      }
      return [];
    }, [item.content]);

    const handleSyncedContent = useCallback((nextContent: Descendant[]) => {
      if (!Array.isArray(nextContent) || nextContent.length === 0) {
        return;
      }
      editorRef.current?.setEditorValue(nextContent.slice(0, 3));
    }, []);

    useReadonlyContentSync(item.contentId, {
      initialContent: editorContent,
      onContentSync: handleSyncedContent,
    });

    const closeActionSheet = useCallback(() => {
      if (sheetActionPending) return;
      setActionSheetMode("none");
    }, [sheetActionPending]);

    const openActionSheet = useCallback((mode: SheetMode) => {
      setSheetRenderMode(mode);
      setActionSheetMode(mode);
    }, []);

    useEffect(() => {
      if (actionSheetOpen) {
        setShouldRenderSheet(true);
        return;
      }
      if (!shouldRenderSheet) return;
      const timer = setTimeout(() => {
        setShouldRenderSheet(false);
      }, 250);
      return () => {
        clearTimeout(timer);
      };
    }, [actionSheetOpen, shouldRenderSheet]);

    useEffect(() => {
      if (actionSheetOpen) return;
      setSheetActionPending(false);
    }, [actionSheetOpen]);

    useEffect(() => {
      if (!actionSheetOpen) return;

      const closeOnViewportChange = () => {
        closeActionSheet();
      };

      window.addEventListener("scroll", closeOnViewportChange, true);
      window.addEventListener("resize", closeOnViewportChange);
      window.addEventListener("orientationchange", closeOnViewportChange);

      return () => {
        window.removeEventListener("scroll", closeOnViewportChange, true);
        window.removeEventListener("resize", closeOnViewportChange);
        window.removeEventListener("orientationchange", closeOnViewportChange);
      };
    }, [actionSheetOpen, closeActionSheet]);

    useEffect(() => {
      return () => {
        if (closeDeleteConfirmTimerRef.current !== null) {
          window.clearTimeout(closeDeleteConfirmTimerRef.current);
        }
      };
    }, []);

    const actionSheetLayer = useMemo(() => {
      if (!shouldRenderSheet || typeof document === "undefined") return null;
      const displayMode =
        actionSheetMode === "none" ? sheetRenderMode : actionSheetMode;

      return createPortal(
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            className={`absolute inset-0 bg-black/50 dark:bg-black/70 ${actionSheetOpen ? "mask-enter" : "mask-exit"}`}
            onClick={closeActionSheet}
            aria-label="关闭操作面板"
            disabled={sheetActionPending}
          />

          <section
            className={`absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-2xl bg-white pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.16)] dark:bg-neutral-900 dark:shadow-[0_-12px_34px_rgba(0,0,0,0.52)] ${actionSheetOpen ? "sheet-enter" : "sheet-exit"}`}
          >
            {displayMode === "menu" ? (
              <>
                <button
                  type="button"
                  className="block w-full border-t border-gray-200 py-4 text-center text-xl font-medium text-gray-900 transition-colors active:bg-gray-100 dark:border-neutral-700 dark:text-neutral-100 dark:active:bg-neutral-800"
                  onClick={() => {
                    openActionSheet("category");
                  }}
                >
                  修改卡片类型
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-gray-200 py-4 text-center text-xl font-medium text-red-600 transition-colors active:bg-red-50 dark:border-neutral-700 dark:text-red-400 dark:active:bg-red-900/20"
                  onClick={() => {
                    setActionSheetMode("none");
                    if (closeDeleteConfirmTimerRef.current !== null) {
                      window.clearTimeout(closeDeleteConfirmTimerRef.current);
                    }
                    closeDeleteConfirmTimerRef.current = window.setTimeout(
                      () => {
                        setDeleteConfirmOpen(true);
                      },
                      170,
                    );
                  }}
                >
                  删除
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-gray-200 py-4 text-center text-xl font-medium text-gray-900 transition-colors active:bg-gray-100 dark:border-neutral-700 dark:text-neutral-100 dark:active:bg-neutral-800"
                  onClick={closeActionSheet}
                  disabled={sheetActionPending}
                >
                  取消
                </button>
              </>
            ) : (
              <>
                {CARD_CATEGORY_OPTIONS.map((option, index) => {
                  const selected = item.category === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={selected || sheetActionPending}
                      className={`relative block w-full py-4 text-center text-xl font-medium transition-colors ${
                        index > 0
                          ? "border-t border-gray-200 dark:border-neutral-700"
                          : ""
                      } ${
                        selected
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-gray-900 active:bg-gray-100 dark:text-neutral-100 dark:active:bg-neutral-800"
                      }`}
                      onClick={async () => {
                        if (selected || !onUpdateCardCategory) {
                          closeActionSheet();
                          return;
                        }
                        setSheetActionPending(true);
                        try {
                          await onUpdateCardCategory(item.id, option.value);
                          setActionSheetMode("none");
                        } catch {
                          // 失败提示由上层统一处理
                        } finally {
                          setSheetActionPending(false);
                        }
                      }}
                    >
                      {option.label}
                      {selected ? (
                        <Check
                          size={18}
                          className="absolute right-5 top-1/2 -translate-y-1/2"
                        />
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="block w-full border-t border-gray-200 py-4 text-center text-xl font-medium text-gray-900 transition-colors active:bg-gray-100 dark:border-neutral-700 dark:text-neutral-100 dark:active:bg-neutral-800"
                  onClick={closeActionSheet}
                  disabled={sheetActionPending}
                >
                  取消
                </button>
              </>
            )}
          </section>
        </div>,
        document.body,
      );
    }, [
      actionSheetMode,
      actionSheetOpen,
      closeActionSheet,
      item.category,
      item.id,
      onUpdateCardCategory,
      openActionSheet,
      sheetActionPending,
      sheetRenderMode,
      shouldRenderSheet,
    ]);

    return (
      <>
        <article className="card relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          <button
            type="button"
            onClick={() => onPreviewCard(item.id)}
            className="w-full p-4 text-left transition-colors active:bg-gray-50 dark:active:bg-neutral-800"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-neutral-500">
                  <span>{formatTimeDisplay(item.updateTime)}</span>
                </div>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="h-8 w-8 shrink-0" />
            </div>

            <div className="pointer-events-none">
              {editorContent.length > 0 ? (
                <Editor
                  ref={editorRef}
                  className="overflow-hidden"
                  readonly={true}
                  initValue={editorContent}
                  theme={theme}
                  extensions={mobileCardPreviewExtensions}
                />
              ) : (
                <p className="line-clamp-1 text-[15px] font-medium text-gray-900 dark:text-neutral-100">
                  {item.excerpt?.split("\n")[0] || `卡片 #${item.id}`}
                </p>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openActionSheet("menu");
            }}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors active:bg-gray-100 dark:text-neutral-500 dark:active:bg-neutral-800"
            aria-label="更多操作"
          >
            <MoreVertical size={16} />
          </button>
        </article>

        {actionSheetLayer}

        <MobileConfirmDialog
          open={deleteConfirmOpen}
          title="确定删除这个卡片？"
          cancelText="取消"
          confirmText="确认"
          danger={true}
          loading={deleteConfirmLoading}
          onCancel={() => {
            if (deleteConfirmLoading) return;
            setDeleteConfirmOpen(false);
          }}
          onConfirm={async () => {
            if (!onDeleteCard) {
              setDeleteConfirmOpen(false);
              return;
            }
            setDeleteConfirmLoading(true);
            try {
              await onDeleteCard(item.id);
              setDeleteConfirmOpen(false);
            } catch {
              // 失败提示由上层统一处理
            } finally {
              setDeleteConfirmLoading(false);
            }
          }}
        />
      </>
    );
  },
);

export default CardItem;
