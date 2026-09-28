import { forwardRef, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { Editor, type EditorRef } from "@tau/editor/src";
import { useCollaborationKit } from "@/hooks/useCollaborationKit";
import useCollaborationStore from "@/stores/useCollaborationStore";
import useContentDocument from "@/hooks/useContentDocument";
import useCollaborationPresence from "@/hooks/useCollaborationPresence";
import type { ContentSessionTarget } from "@tau/collaboration";
import type { Descendant } from "slate";

type ContentEditorProps = ComponentProps<typeof Editor> & {
  contentId?: number;
  source?: Omit<ContentSessionTarget, "contentId">;
  onLoadError?: (error: string) => void;
  /** 会话就绪前的占位（缺省为转圈）；传只读渲染可让「阅读 → 编辑」切换不闪不跳 */
  fallback?: ReactNode;
};

const ContentEditor = forwardRef<EditorRef, ContentEditorProps>(
  ({ contentId, source, onLoadError, fallback, ...props }, ref) => {
    const sessions = useCollaborationStore(state => state.sessions);
    const readonly = props.readonly ?? true;
    const { document, binding, article, error, sessionError, frozen, swapping } =
      useContentDocument(contentId, source);
    const session = sessions.find(item => item.id === binding?.doc.guid);
    const callback = useRef(props.onChange);
    const editorRef = useRef<EditorRef | null>(null);
    callback.current = props.onChange;
    const presence = useCollaborationPresence(binding, readonly || frozen);
    // 场景 kit 要经协作派生（共享模式下资源与音视频服务被覆盖），不能让 props.kit 直接覆盖
    const kit = useCollaborationKit(binding, props.kit);
    useEffect(() => {
      const loadError = sessionError || (!document && error);
      if (loadError) onLoadError?.(loadError);
    }, [sessionError, error, document, onLoadError]);
    useEffect(() => {
      if (binding && article && editorRef.current)
        callback.current?.(article.content as Descendant[], editorRef.current.getEditor());
    }, [binding, article]);
    if (contentId && !document) {
      if (fallback !== undefined && !sessionError && !error) return <>{fallback}</>;
      return (
        <div role="status" className="text-text-3 flex min-h-40 items-center justify-center">
          {sessionError || error || <LoadingOutlined spin />}
        </div>
      );
    }
    return (
      <>
        {error && (
          <div role="alert" style={{ color: "#dc2626", fontSize: 12 }}>
            {error}
          </div>
        )}
        <Editor
          {...props}
          kit={kit}
          ref={value => {
            editorRef.current = value;
            if (typeof ref === "function") ref(value);
            else if (ref) ref.current = value;
          }}
          document={document}
          readonly={
            readonly || frozen || swapping || Boolean(session && session.status !== "active")
          }
          onChange={document ? undefined : props.onChange}
          onFocus={() => {
            presence.onFocus();
            props.onFocus?.();
          }}
          onBlur={() => {
            presence.onBlur();
            props.onBlur?.();
          }}
        />
      </>
    );
  }
);

ContentEditor.displayName = "ContentEditor";
export default ContentEditor;
