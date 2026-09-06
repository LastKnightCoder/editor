import { forwardRef, useEffect, useRef, type ComponentProps } from "react";
import { Editor, type EditorRef } from "@tau/editor/src";
import { CollaborationServices } from "@/components/CollaborationEditor";
import useCollaborationDocument from "@/hooks/useCollaborationDocument";
import useCollaborationStore from "@/stores/useCollaborationStore";
import useContentSession from "@/hooks/useContentSession";
import useCollaborationPresence from "@/hooks/useCollaborationPresence";
import ContentCollaborationControl from "@/components/ContentCollaborationControl";
import type { ContentSessionTarget } from "@tau/collaboration";
import type { Descendant } from "slate";

type ContentEditorProps = ComponentProps<typeof Editor> & {
  contentId?: number;
  source?: Omit<ContentSessionTarget, "contentId">;
  collaborationControl?: boolean;
};

const ContentEditor = forwardRef<EditorRef, ContentEditorProps>(
  ({ contentId, source, collaborationControl = true, ...props }, ref) => {
    const sessions = useCollaborationStore(state => state.sessions);
    const readonly = props.readonly ?? true;
    const { entry, error: sessionError } = useContentSession(contentId, source);
    const documentId = entry?.documentId;
    const session = sessions.find(item => item.id === documentId);
    const { binding, article, error, frozen } = useCollaborationDocument(documentId);
    const callback = useRef(props.onChange);
    const editorRef = useRef<EditorRef | null>(null);
    callback.current = props.onChange;
    const presence = useCollaborationPresence(binding, readonly || frozen);
    useEffect(() => {
      if (binding && article && editorRef.current)
        callback.current?.(article.content as Descendant[], editorRef.current.getEditor());
    }, [binding, article]);
    if (contentId && !binding)
      return <div role="status">{sessionError || error || "正在加载内容"}</div>;
    return (
      <>
        {error && (
          <div role="alert" style={{ color: "#dc2626", fontSize: 12 }}>
            {error}
          </div>
        )}
        {contentId && collaborationControl && (
          <ContentCollaborationControl contentId={contentId} source={source} />
        )}
        <CollaborationServices binding={binding}>
          <Editor
            {...props}
            key={`${contentId || "local"}:${documentId || "local"}`}
            ref={value => {
              editorRef.current = value;
              if (typeof ref === "function") ref(value);
              else if (ref) ref.current = value;
            }}
            collaboration={binding || props.collaboration}
            readonly={readonly || frozen || Boolean(session && session.status !== "active")}
            onChange={binding ? undefined : props.onChange}
            onFocus={() => {
              presence.onFocus();
              props.onFocus?.();
            }}
            onBlur={() => {
              presence.onBlur();
              props.onBlur?.();
            }}
          />
        </CollaborationServices>
      </>
    );
  }
);

ContentEditor.displayName = "ContentEditor";
export default ContentEditor;
