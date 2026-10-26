import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useContentLocation } from "./useContentLocation";
import { DocTasksStatusBar } from "./DocTasksStatusBar";
import { Loader2 } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor";
import { useCollaborationKit } from "@/hooks/useCollaborationKit";
import useCollaborationStore from "@/stores/useCollaborationStore";
import useContentDocument, { useTransientContentDocument } from "@/hooks/useContentDocument";
import useCollaborationPresence from "@/hooks/useCollaborationPresence";
import {
  createActiveEditingSessionId,
  removeActiveEditingSession,
  setActiveEditingSessionFocus,
  updateActiveEditingSessionContent,
  updateActiveEditingSessionSelection,
  upsertActiveEditingSession,
} from "@/services/content-editing";
import type { EntityType } from "@/services/content-editing";
import type { ContentSessionTarget } from "@tau/collaboration";
import type { Descendant } from "slate";

type ContentEditorProps = ComponentProps<typeof Editor> & {
  at?: string;
  contentId?: number;
  contracts?: import("@tau/db-schema/content-contracts").ContentContractDictionary;
  source?: Omit<ContentSessionTarget, "contentId">;
  onLoadError?: (error: string) => void;
  /** 会话就绪前的占位（缺省为转圈）；传只读渲染可让「阅读 → 编辑」切换不闪不跳 */
  fallback?: ReactNode;
  /** 声明编辑目标身份后，可写实例会注册为 AI 可感知的「当前编辑上下文」（选区/光标/内容） */
  editingContext?: { entityType: EntityType; entityId?: number | string };
};

/** 内容快照重建要全量序列化 markdown，防抖到输入停顿后执行 */
const EDITING_SESSION_SNAPSHOT_DEBOUNCE_MS = 500;

function ContentLocation({
  editor,
  contentId,
  at,
}: {
  editor: ReturnType<EditorRef["getEditor"]> | null;
  contentId?: number;
  at: string;
}) {
  useContentLocation(editor, contentId, at);
  return null;
}

const containsContract = (nodes: readonly Descendant[]): boolean =>
  nodes.some(
    node => "tauContract" in node || ("children" in node && containsContract(node.children))
  );

const ContentEditor = forwardRef<EditorRef, ContentEditorProps>(
  ({ contentId, contracts, source, onLoadError, fallback, editingContext, at, ...props }, ref) => {
    const [locationEditor, setLocationEditor] = useState<{
      editor: ReturnType<EditorRef["getEditor"]>;
      contentId?: number;
    } | null>(null);
    const onInitRef = useRef(props.onInit);
    onInitRef.current = props.onInit;
    const atRef = useRef(at);
    atRef.current = at;
    const initializedEditor = useRef<typeof locationEditor>(null);
    const handleInit = useCallback(
      (editor: ReturnType<EditorRef["getEditor"]>, content: Descendant[]) => {
        initializedEditor.current = { editor, contentId };
        if (atRef.current)
          setLocationEditor(previous =>
            previous?.editor === editor && previous.contentId === contentId
              ? previous
              : { editor, contentId }
          );
        onInitRef.current?.(editor, content);
      },
      [contentId]
    );
    useEffect(() => {
      if (at) setLocationEditor(initializedEditor.current);
    }, [at]);
    const sessions = useCollaborationStore(state => state.sessions);
    const readonly = props.readonly ?? true;
    const {
      document: storedDocument,
      binding,
      article,
      error: storedError,
      sessionError,
      frozen,
      swapping,
    } = useContentDocument(contentId, source, props.kit, props.extensions);
    const session = sessions.find(item => item.id === binding?.doc.guid);
    const callback = useRef(props.onChange);
    const editorRef = useRef<EditorRef | null>(null);
    callback.current = props.onChange;
    const forwardedRef = useRef(ref);
    forwardedRef.current = ref;
    // 回调 ref 必须稳定：Editor 的 useImperativeHandle 以 ref 为依赖，换身份时会先置空再挂回，
    // 期间编辑器内部的 layout effect（如 decorate 变化后的装饰重算）经外部 ref 读到的是 null
    const setEditorRef = useCallback((value: EditorRef | null) => {
      editorRef.current = value;
      const target = forwardedRef.current;
      if (typeof target === "function") target(value);
      else if (target) target.current = value;
    }, []);
    const presence = useCollaborationPresence(binding, readonly || frozen);
    // 场景 kit 要经协作派生（共享模式下资源与音视频服务被覆盖），不能让 props.kit 直接覆盖
    const kit = useCollaborationKit(binding, props.kit);
    const hasContracts =
      !contentId && (contracts !== undefined || containsContract(props.initValue ?? []));
    const transient = useTransientContentDocument(
      hasContracts ? props.initValue : undefined,
      contracts,
      kit,
      readonly,
      props.onChange
    );
    const document = storedDocument ?? transient.document;
    const error = storedError ?? transient.error;

    // AI 编辑上下文（active-editor-session）注册：非只读 + 声明身份才登记
    const { entityType, entityId } = editingContext ?? {};
    const canRegisterEditing = Boolean(!readonly && contentId && entityType && entityId);
    const editingSessionRef = useRef<string | null>(null);
    const contentRef = useRef<Descendant[] | null>(null);
    const snapshotTimerRef = useRef<number | undefined>(undefined);

    const trackEditingContent = (content: Descendant[]) => {
      contentRef.current = content;
      const sessionId = editingSessionRef.current;
      if (!sessionId) return;
      window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = window.setTimeout(() => {
        if (editingSessionRef.current && contentRef.current) {
          updateActiveEditingSessionContent(editingSessionRef.current, contentRef.current);
        }
      }, EDITING_SESSION_SNAPSHOT_DEBOUNCE_MS);
    };

    useEffect(() => {
      const loadError = sessionError || (!document && error);
      if (loadError) onLoadError?.(loadError);
    }, [sessionError, error, document, onLoadError]);

    useEffect(() => {
      if (binding && article && editorRef.current) {
        trackEditingContent(article.content as Descendant[]);
        callback.current?.(article.content as Descendant[], editorRef.current.getEditor());
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [binding, article]);

    useEffect(() => {
      if (!canRegisterEditing || !contentId || !entityType || !entityId) return;
      const sessionId = createActiveEditingSessionId();
      editingSessionRef.current = sessionId;
      upsertActiveEditingSession({
        sessionId,
        contentId,
        entityType,
        entityId,
        content: contentRef.current ?? [],
      });
      return () => {
        window.clearTimeout(snapshotTimerRef.current);
        removeActiveEditingSession(sessionId);
        editingSessionRef.current = null;
      };
    }, [canRegisterEditing, contentId, entityType, entityId]);

    if ((contentId || hasContracts) && !document) {
      if (fallback !== undefined && !sessionError && !error) return <>{fallback}</>;
      return (
        <div role="status" className="text-ink-3 flex min-h-40 items-center justify-center">
          {sessionError || error || <Loader2 className="animate-spin" />}
        </div>
      );
    }
    return (
      <>
        {at && !swapping && !frozen && (
          <ContentLocation
            at={at}
            contentId={contentId}
            editor={
              locationEditor?.contentId === contentId ? (locationEditor?.editor ?? null) : null
            }
          />
        )}
        {error && (
          <div role="alert" style={{ color: "#dc2626", fontSize: 12 }}>
            {error}
          </div>
        )}
        <Editor
          {...props}
          kit={kit}
          onInit={handleInit}
          ref={setEditorRef}
          document={document}
          readonly={
            readonly || frozen || swapping || Boolean(session && session.status !== "active")
          }
          onChange={
            document
              ? undefined
              : (value, editor) => {
                  trackEditingContent(value);
                  props.onChange?.(value, editor);
                }
          }
          onSelectionChange={() => {
            props.onSelectionChange?.();
            if (!editingSessionRef.current) return;
            updateActiveEditingSessionSelection(
              editingSessionRef.current,
              editorRef.current?.getEditor().selection ?? null
            );
          }}
          onFocus={() => {
            presence.onFocus();
            props.onFocus?.();
            if (!editingSessionRef.current) return;
            setActiveEditingSessionFocus(editingSessionRef.current, true);
            updateActiveEditingSessionSelection(
              editingSessionRef.current,
              editorRef.current?.getEditor().selection ?? null
            );
          }}
          onBlur={() => {
            presence.onBlur();
            props.onBlur?.();
            if (editingSessionRef.current) {
              setActiveEditingSessionFocus(editingSessionRef.current, false);
            }
          }}
        />
        {/* 只给声明了编辑身份的正文（卡片 / 文章 / 项目文档 / 日记）；预览、描述等场景不出现 */}
        {canRegisterEditing && <DocTasksStatusBar contentId={contentId} />}
      </>
    );
  }
);

ContentEditor.displayName = "ContentEditor";
export default ContentEditor;
