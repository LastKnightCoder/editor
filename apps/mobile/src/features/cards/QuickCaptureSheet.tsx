import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor/src";
import type { Descendant } from "slate";
import { SnapSheet } from "../../components/SnapSheet";
import { useMobileTheme } from "../../hooks/useMobileTheme";
import { ActionSheet } from "../settings/components/ActionSheet";
import {
  CARD_CATEGORY_OPTIONS,
  isKnownCardCategory,
  type KnownCardCategory,
} from "./cardCategory";
import { MobileEditorBottomToolbar } from "./editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "./editorToolbar/useMobileEditorToolbarController";
import { mobileCardPreviewExtensions } from "./editorExtensions";
import { EMPTY_EDITOR_CONTENT } from "./editorContentUtils";
import {
  clearQuickCaptureDraft,
  readQuickCaptureDraft,
  writeQuickCaptureDraft,
} from "./quickCaptureDraft";

type QuickCaptureSheetProps = {
  open: boolean;
  saving: boolean;
  category: KnownCardCategory;
  onRequestClose: (content: Descendant[]) => void;
  onContentChange?: (content: Descendant[]) => void;
  onCategoryChange?: (category: KnownCardCategory) => void;
  onClear?: () => void;
};

export function QuickCaptureSheet(props: QuickCaptureSheetProps) {
  const { theme } = useMobileTheme();
  const editorRef = useRef<EditorRef | null>(null);
  const latestContentRef = useRef<Descendant[]>(EMPTY_EDITOR_CONTENT);
  const [cachedDraft, setCachedDraft] = useState<Descendant[] | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const toolbarController = useMobileEditorToolbarController({
    editorRef,
  });

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

  useEffect(() => {
    if (props.open) return;
    setCategorySheetOpen(false);
  }, [props.open]);

  const handleCloseRequest = () => {
    if (props.saving) return;
    props.onRequestClose(latestContentRef.current);
  };
  const categoryLabel =
    CARD_CATEGORY_OPTIONS.find((item) => item.value === props.category)
      ?.label ?? "闪念";
  const categoryTitle = `${categoryLabel}卡片`;

  return (
    <SnapSheet
      open={props.open}
      defaultState="normal"
      states={["normal", "full"]}
      normalHeight={0.78}
      onClose={handleCloseRequest}
      containerClassName="bg-white dark:bg-neutral-950"
    >
      <>
        <SnapSheet.Handle />

        <header className="quick-capture-sheet-header flex items-center justify-between gap-2 border-b border-gray-100 px-4 pb-3 dark:border-neutral-800">
          <div className="min-w-0">
            <button
              type="button"
              disabled={props.saving}
              onClick={() => {
                setCategorySheetOpen(true);
              }}
              className="rounded px-1 py-0.5 text-sm font-semibold text-gray-900 transition-colors active:bg-gray-100 disabled:opacity-50 dark:text-neutral-100 dark:active:bg-neutral-800"
            >
              {categoryTitle}
            </button>
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
                props.onClear?.();
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

        <SnapSheet.FixedFooterScroll className="px-4 pt-3">
          <Editor
            ref={editorRef}
            initValue={EMPTY_EDITOR_CONTENT}
            readonly={false}
            theme={theme}
            extensions={mobileCardPreviewExtensions}
            placeHolder="记录你的想法..."
            className="mobile-card-editor-content min-h-[220px] outline-none ring-0 focus:outline-none focus:ring-0"
            onFocus={toolbarController.handleEditorFocus}
            onBlur={toolbarController.handleEditorBlur}
            onChange={(value) => {
              latestContentRef.current = value;
              props.onContentChange?.(value);
              writeQuickCaptureDraft(value);
              if (showDraftPrompt) {
                setShowDraftPrompt(false);
              }
              toolbarController.syncSelection();
            }}
            onSelectionChange={toolbarController.syncSelection}
          />
        </SnapSheet.FixedFooterScroll>

        <ActionSheet
          open={categorySheetOpen}
          title="选择卡片类型"
          value={props.category}
          options={CARD_CATEGORY_OPTIONS}
          onClose={() => setCategorySheetOpen(false)}
          onSelect={(value) => {
            if (!isKnownCardCategory(value)) {
              return;
            }
            props.onCategoryChange?.(value);
          }}
        />
        <MobileEditorBottomToolbar controller={toolbarController} />
      </>
    </SnapSheet>
  );
}

export default QuickCaptureSheet;
