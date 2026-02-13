import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor/src";
import type { Descendant } from "slate";
import { useMobileTheme } from "../../hooks/useMobileTheme";
import { mobileCardPreviewExtensions } from "./editorExtensions";
import { shouldPreventBackgroundTouchMove } from "./touchMoveGuard";
import { EMPTY_EDITOR_CONTENT } from "./editorContentUtils";
import {
  clearQuickCaptureDraft,
  readQuickCaptureDraft,
  writeQuickCaptureDraft,
} from "./quickCaptureDraft";

type QuickCaptureSheetProps = {
  open: boolean;
  saving: boolean;
  onRequestClose: (content: Descendant[]) => void;
  onContentChange?: (content: Descendant[]) => void;
};

export function QuickCaptureSheet(props: QuickCaptureSheetProps) {
  const { theme } = useMobileTheme();
  const sheetRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<EditorRef | null>(null);
  const latestContentRef = useRef<Descendant[]>(EMPTY_EDITOR_CONTENT);
  const [shouldRender, setShouldRender] = useState(false);
  const [cachedDraft, setCachedDraft] = useState<Descendant[] | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

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
    const draft = readQuickCaptureDraft();
    setCachedDraft(draft);
    setShowDraftPrompt(Boolean(draft));
    latestContentRef.current = EMPTY_EDITOR_CONTENT;
    props.onContentChange?.(EMPTY_EDITOR_CONTENT);

    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.setEditorValue(EMPTY_EDITOR_CONTENT);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [props.open, props.onContentChange]);

  if (!shouldRender) {
    return null;
  }

  const handleCloseRequest = () => {
    if (props.saving) return;
    props.onRequestClose(latestContentRef.current);
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭闪念抽屉"
        className={`absolute inset-0 bg-black/50 dark:bg-black/70 ${props.open ? "mask-enter" : "mask-exit"}`}
        onClick={handleCloseRequest}
        disabled={props.saving}
      />

      <section
        ref={sheetRef}
        className={`absolute bottom-0 left-0 right-0 flex min-h-[56dvh] max-h-[88dvh] flex-col rounded-t-2xl bg-white dark:bg-neutral-950 ${props.open ? "sheet-enter" : "sheet-exit"}`}
      >
        <div className="flex justify-center py-3">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-neutral-600" />
        </div>

        <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 pb-3 dark:border-neutral-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
              闪念卡片
            </h2>
            <p className="text-xs text-gray-400 dark:text-neutral-500">
              {props.saving ? "正在保存..." : "关闭时自动保存"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                editorRef.current?.setEditorValue(EMPTY_EDITOR_CONTENT);
                latestContentRef.current = EMPTY_EDITOR_CONTENT;
                props.onContentChange?.(EMPTY_EDITOR_CONTENT);
                clearQuickCaptureDraft();
                setCachedDraft(null);
                setShowDraftPrompt(false);
              }}
              disabled={props.saving}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 transition-colors active:bg-gray-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
            >
              清空
            </button>
            <button
              type="button"
              onClick={handleCloseRequest}
              disabled={props.saving}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors active:bg-gray-100 disabled:opacity-40 dark:text-neutral-400 dark:active:bg-neutral-800"
              aria-label="关闭闪念抽屉"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {showDraftPrompt && cachedDraft ? (
          <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-300">
            <p>检测到上次未保存草稿，是否恢复？</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="rounded-full bg-amber-600 px-3 py-1 text-[11px] text-white dark:bg-amber-500"
                onClick={() => {
                  editorRef.current?.setEditorValue(cachedDraft);
                  latestContentRef.current = cachedDraft;
                  props.onContentChange?.(cachedDraft);
                  writeQuickCaptureDraft(cachedDraft);
                  setShowDraftPrompt(false);
                }}
              >
                恢复草稿
              </button>
              <button
                type="button"
                className="rounded-full border border-amber-300 px-3 py-1 text-[11px] dark:border-amber-600"
                onClick={() => {
                  clearQuickCaptureDraft();
                  setCachedDraft(null);
                  setShowDraftPrompt(false);
                }}
              >
                丢弃草稿
              </button>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe pt-3">
          <Editor
            ref={editorRef}
            initValue={EMPTY_EDITOR_CONTENT}
            readonly={false}
            theme={theme}
            extensions={mobileCardPreviewExtensions}
            placeHolder="记录你的想法..."
            className="min-h-[220px] text-[18px] leading-8 outline-none ring-0 focus:outline-none focus:ring-0"
            onChange={(value) => {
              latestContentRef.current = value;
              props.onContentChange?.(value);
              writeQuickCaptureDraft(value);
              if (showDraftPrompt) {
                setShowDraftPrompt(false);
              }
            }}
          />
        </div>
      </section>
    </div>
  );
}

export default QuickCaptureSheet;
