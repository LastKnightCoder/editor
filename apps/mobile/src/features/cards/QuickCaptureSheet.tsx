import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { getMobileContentKit } from "../../services/editorKit";
import { X } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor";
import type { Descendant } from "slate";
import { SnapSheet } from "../../components/SnapSheet";
import { MobileEditorBottomToolbar } from "./editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "./editorToolbar/useMobileEditorToolbarController";
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
  onClear?: () => void;
};

export function QuickCaptureSheet(props: QuickCaptureSheetProps) {
  const wasOpen = useRef(false);
  const notifyContentChange = useMemoizedFn((content: Descendant[]) =>
    props.onContentChange?.(content)
  );
  const editorRef = useRef<EditorRef | null>(null);
  const [editorSession, setEditorSession] = useState({ revision: 0, value: EMPTY_EDITOR_CONTENT });
  const latestContentRef = useRef<Descendant[]>(EMPTY_EDITOR_CONTENT);
  const [cachedDraft, setCachedDraft] = useState<Descendant[] | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const toolbarController = useMobileEditorToolbarController({
    editorRef,
  });

  useEffect(() => {
    if (!props.open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    const draft = readQuickCaptureDraft();
    setCachedDraft(draft);
    setShowDraftPrompt(Boolean(draft));
    latestContentRef.current = EMPTY_EDITOR_CONTENT;
    notifyContentChange(EMPTY_EDITOR_CONTENT);

    setEditorSession(previous => ({
      revision: previous.revision + 1,
      value: EMPTY_EDITOR_CONTENT,
    }));
  }, [props.open, notifyContentChange]);

  const handleCloseRequest = () => {
    if (props.saving) return;
    props.onRequestClose(latestContentRef.current);
  };

  return (
    <SnapSheet
      open={props.open}
      defaultState="normal"
      states={["normal", "full"]}
      normalHeight={0.78}
      // 主体抽屉 backDismiss={false}：本页关闭即弹栈，返回走页面 backHandler（冲洗落库）
      backDismiss={false}
      onClose={handleCloseRequest}
    >
      <>
        <SnapSheet.Handle />

        <header className="quick-capture-sheet-header border-line flex items-center justify-end gap-2 border-b border-dashed px-4 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditorSession(previous => ({
                  revision: previous.revision + 1,
                  value: EMPTY_EDITOR_CONTENT,
                }));
                latestContentRef.current = EMPTY_EDITOR_CONTENT;
                props.onContentChange?.(EMPTY_EDITOR_CONTENT);
                clearQuickCaptureDraft();
                setCachedDraft(null);
                setShowDraftPrompt(false);
                props.onClear?.();
              }}
              disabled={props.saving}
              className="border-line text-ink-2 active:bg-press rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40"
            >
              清空
            </button>
            <button
              type="button"
              onClick={handleCloseRequest}
              disabled={props.saving}
              className="text-ink-3 active:bg-press flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40"
              aria-label="关闭快速捕获"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {showDraftPrompt && cachedDraft ? (
          <div className="bg-butter-soft text-butter mx-4 mt-3 rounded-2xl px-3.5 py-2.5 text-xs">
            <p className="font-semibold">检测到上次未保存草稿，是否恢复？</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="bg-butter rounded-full px-3.5 py-1 text-[11px] font-bold text-white"
                onClick={() => {
                  setEditorSession(previous => ({
                    revision: previous.revision + 1,
                    value: cachedDraft,
                  }));
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
                className="border-butter/50 rounded-full border px-3.5 py-1 text-[11px] font-semibold"
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
            key={editorSession.revision}
            kit={getMobileContentKit()}
            ref={editorRef}
            initValue={editorSession.value}
            readonly={false}
            placeHolder="记录你的想法..."
            className="mobile-card-editor-content min-h-[220px] outline-none ring-0 focus:outline-none focus:ring-0"
            onFocus={toolbarController.handleEditorFocus}
            onBlur={toolbarController.handleEditorBlur}
            onChange={value => {
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

        <MobileEditorBottomToolbar controller={toolbarController} />
      </>
    </SnapSheet>
  );
}

export default QuickCaptureSheet;
