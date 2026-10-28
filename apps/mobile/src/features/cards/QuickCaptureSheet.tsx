import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMemoizedFn } from "ahooks";
import { useMobileContentKit } from "../../services/editorKit";
import { EditorKitPending } from "../../components/EditorKitPending";
import { X } from "lucide-react";
import { Editor, type EditorRef, type EditorDocument } from "@tau/editor";
import type { Descendant } from "slate";
import { SnapSheet } from "../../components/SnapSheet";
import { MobileEditorBottomToolbar } from "./editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "./editorToolbar/useMobileEditorToolbarController";
import { EMPTY_EDITOR_CONTENT } from "./editorContentUtils";
import { useContentMention } from "./editorExtensions/useContentMention";
import { useOptionalPageInstanceContext } from "../../router/pageLifecycle";
import { useMobileEntityHostRevision } from "../../services/pluginEntities";
import {
  clearQuickCaptureDraft,
  readQuickCaptureDraft,
  writeQuickCaptureDraft,
} from "./quickCaptureDraft";

type QuickCaptureSheetProps = {
  open: boolean;
  saving: boolean;
  document?: EditorDocument;
  editorRef?: RefObject<EditorRef | null>;
  readonly?: boolean;
  onRequestClose: (content: Descendant[]) => void;
  onContentChange?: (content: Descendant[]) => void;
  onClear?: () => Promise<boolean>;
};

export function QuickCaptureSheet(props: QuickCaptureSheetProps) {
  const contentKit = useMobileContentKit("edit");
  const wasOpen = useRef(false);
  const notifyContentChange = useMemoizedFn((content: Descendant[]) =>
    props.onContentChange?.(content)
  );
  const ownEditorRef = useRef<EditorRef | null>(null);
  const editorRef = props.editorRef ?? ownEditorRef;
  const [editorSession, setEditorSession] = useState({ revision: 0, value: EMPTY_EDITOR_CONTENT });
  const latestContentRef = useRef<Descendant[]>(EMPTY_EDITOR_CONTENT);
  const [cachedDraft, setCachedDraft] = useState<Descendant[] | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const toolbarController = useMobileEditorToolbarController({
    editorRef,
  });
  const page = useOptionalPageInstanceContext();
  const hostRevision = useMobileEntityHostRevision();
  const mentionDocument = useMemo(
    () => ({ document: props.document, editorSession, hostRevision }),
    [props.document, editorSession, hostRevision]
  );
  useContentMention({
    editorRef,
    documentKey: mentionDocument,
    enabled:
      Boolean(contentKit) &&
      props.open &&
      props.readonly === false &&
      !props.document?.readonly &&
      page?.phase !== "paused",
    onRequest: toolbarController.openContentMention,
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

        <header className="quick-capture-sheet-header border-line-1 flex items-center justify-end gap-2 border-b border-dashed px-4 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (props.onClear && !(await props.onClear())) return;
                setEditorSession(previous => ({
                  revision: previous.revision + 1,
                  value: EMPTY_EDITOR_CONTENT,
                }));
                latestContentRef.current = EMPTY_EDITOR_CONTENT;
                props.onContentChange?.(EMPTY_EDITOR_CONTENT);
                clearQuickCaptureDraft();
                setCachedDraft(null);
                setShowDraftPrompt(false);
              }}
              disabled={props.saving}
              className="border-line-1 text-ink-2 active:bg-hover rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40"
            >
              清空
            </button>
            <button
              type="button"
              onClick={handleCloseRequest}
              disabled={props.saving}
              className="text-ink-3 active:bg-hover flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40"
              aria-label="关闭快速捕获"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {showDraftPrompt && cachedDraft ? (
          <div className="bg-tag-4-soft text-tag-4 mx-4 mt-3 rounded-2xl px-3.5 py-2.5 text-xs">
            <p className="font-semibold">检测到上次未保存草稿，是否恢复？</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="bg-tag-4 text-ink-inverse rounded-full px-3.5 py-1 text-[11px] font-bold"
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
                className="border-tag-4/50 rounded-full border px-3.5 py-1 text-[11px] font-semibold"
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
          {contentKit ? (
            <Editor
              key={editorSession.revision}
              kit={contentKit}
              document={props.document}
              ref={editorRef}
              initValue={editorSession.value}
              readonly={props.readonly}
              placeHolder="记录你的想法..."
              className="mobile-card-editor-content min-h-[220px] ring-0 outline-none focus:ring-0 focus:outline-none"
              onFocus={toolbarController.handleEditorFocus}
              onBlur={toolbarController.handleEditorBlur}
              onChange={value => {
                latestContentRef.current = value;
                if (!props.document) {
                  props.onContentChange?.(value);
                  writeQuickCaptureDraft(value);
                }
                if (showDraftPrompt) {
                  setShowDraftPrompt(false);
                }
                toolbarController.syncSelection();
              }}
              onSelectionChange={toolbarController.syncSelection}
            />
          ) : (
            <EditorKitPending className="min-h-[220px]" />
          )}
        </SnapSheet.FixedFooterScroll>

        <MobileEditorBottomToolbar controller={toolbarController} />
      </>
    </SnapSheet>
  );
}

export default QuickCaptureSheet;
