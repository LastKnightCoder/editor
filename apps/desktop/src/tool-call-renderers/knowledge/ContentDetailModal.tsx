import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { Editor, EditorRef } from "@tau/editor/src";
import ErrorBoundary from "@/components/ErrorBoundary";
import CustomModal from "@/components/CustomModal";
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
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const editorRef = useRef<EditorRef>(null);
  const [loading, setLoading] = useState(true);
  const [initValue, setInitValue] = useState<Descendant[] | null>(null);

  const { throttleHandleEditorContentChange } = useEditContent(
    contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  useEffect(() => {
    if (!visible || !contentId) {
      setLoading(true);
      setInitValue(null);
      return;
    }
    setLoading(true);
    getContentById(contentId).then((data) => {
      setInitValue(data?.content ?? null);
      setLoading(false);
    });
  }, [visible, contentId]);

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
  });

  const headerTitle = (
    <div className="flex items-center gap-2 min-w-0">
      <span className="truncate font-bold text-base">{title}</span>
      <span className="shrink-0 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
        {typeName}
      </span>
    </div>
  );

  return (
    <CustomModal
      title={headerTitle}
      open={visible && !!contentId}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
      closeOnEscape
      bodyClassName="max-h-[70vh] overflow-auto"
    >
      {loading || !initValue ? (
        <div className="flex justify-center items-center h-48 text-sm text-slate-400">
          加载中...
        </div>
      ) : (
        <div className="min-h-[200px]">
          <ErrorBoundary>
            <Editor
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
    </CustomModal>
  );
};

export default ContentDetailModal;
