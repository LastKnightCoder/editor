import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor/src";
import type { Descendant } from "slate";
import { PanContainer } from "../../components/PanContainer";
import { useMobileTheme } from "../../hooks/useMobileTheme";
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
  onRequestClose: (content: Descendant[]) => void;
  onContentChange?: (content: Descendant[]) => void;
};

export function QuickCaptureSheet(props: QuickCaptureSheetProps) {
  const { theme } = useMobileTheme();
  const editorRef = useRef<EditorRef | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const latestContentRef = useRef<Descendant[]>(EMPTY_EDITOR_CONTENT);
  const [cachedDraft, setCachedDraft] = useState<Descendant[] | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

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

  const handleCloseRequest = () => {
    if (props.saving) return;
    props.onRequestClose(latestContentRef.current);
  };

  return (
    <PanContainer
      open={props.open}
      initialState="normal"
      enabledStates={["normal", "full"]}
      heights={{ normal: 0.78 }}
      onRequestClose={handleCloseRequest}
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
            className={`flex items-center justify-between gap-2 border-b border-gray-100 px-4 ${
              timeline.state === "full"
                ? "mobile-safe-top-gap pb-3 dark:border-neutral-800"
                : "pb-3 dark:border-neutral-800"
            }`}
          >
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                闪念卡片
              </h2>
              <p
                className="text-xs text-gray-400 dark:text-neutral-500"
                style={{
                  opacity: 0.35 + timeline.overallProgress * 0.65,
                  transform: `translateY(${(1 - timeline.overallProgress) * 12}px)`,
                }}
              >
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

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe pt-3"
          >
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
        </>
      )}
    </PanContainer>
  );
}

export default QuickCaptureSheet;
