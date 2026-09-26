import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { EditorRef } from "@tau/editor/src";
import { Dialog, DialogBody, Spinner } from "@tau/ui";
import Editor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import useEditContent from "@/hooks/useEditContent";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { getContentById } from "@/commands/content";

interface ContentDetailModalProps {
  contentId: number | undefined;
  title: string;
  typeName: string;
  visible: boolean;
  onClose: () => void;
}

const ContentDetailModal = ({
  contentId,
  title,
  typeName,
  visible,
  onClose,
}: ContentDetailModalProps) => {
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const editorRef = useRef<EditorRef>(null);
  const [loading, setLoading] = useState(true);
  const [initValue, setInitValue] = useState<Descendant[] | null>(null);

  const { throttleHandleEditorContentChange } = useEditContent(contentId, content => {
    editorRef.current?.setEditorValue(content);
  });

  useEffect(() => {
    if (!visible || !contentId) {
      setLoading(true);
      setInitValue(null);
      return;
    }
    setLoading(true);
    getContentById(contentId).then(data => {
      setInitValue(data?.content ?? null);
      setLoading(false);
    });
  }, [visible, contentId]);

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
  });

  return (
    <Dialog
      open={visible && !!contentId}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      title={title}
      context={typeName || undefined}
      width={800}
    >
      <DialogBody>
        {loading || !initValue ? (
          <div className="text-ink-3 text-tau-meta flex h-48 items-center justify-center gap-2">
            <Spinner />
            加载中…
          </div>
        ) : (
          <div className="text-ink-1 min-h-50 pb-2">
            <ErrorBoundary>
              <Editor
                contentId={contentId}
                key={contentId}
                ref={editorRef}
                initValue={initValue}
                onChange={onContentChange}
                extensions={dynamicExtensions}
                readonly={false}
              />
            </ErrorBoundary>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
};

export default ContentDetailModal;
