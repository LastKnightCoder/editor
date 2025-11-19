import React, { useMemo, useRef } from "react";
import { CloseOutlined } from "@ant-design/icons";
import Editor, { EditorRef } from "@/components/Editor";
import useEditContent from "@/hooks/useEditContent";
import useUploadResource from "@/hooks/useUploadResource";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";
import { getEditorText } from "@/utils/editor";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { Descendant } from "slate";

interface NotePanelProps {
  contentId?: number;
  onClose: () => void;
}

const NotePanel: React.FC<NotePanelProps> = ({ contentId, onClose }) => {
  const { content, throttleHandleEditorContentChange } = useEditContent(
    contentId,
    () => {},
  );

  const editorRef = useRef<EditorRef>(null);
  const uploadResource = useUploadResource();
  const extensions = useDynamicExtensions();

  const [width, setWidth] = useLocalStorageState<number>("note-panel-width", {
    defaultValue: 400,
  });

  const title = useMemo(() => {
    if (!content) return "加载中...";
    const text = getEditorText(content, 20).trim();
    return text.length < 20 ? text : `${text}...` || "未命名笔记";
  }, [content]);

  const handleContentChange = useMemoizedFn((content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
  });

  return (
    <ResizeableAndHideableSidebar
      width={width || 400}
      open={!!contentId}
      onWidthChange={(w) => setWidth(w)}
      minWidth={200}
      maxWidth={600}
      side="left"
      className="h-full bg-white dark:bg-[#1e1e1e] z-50 flex flex-col border-l border-[#f0f0f0] dark:border-[#2a2a2a] overflow-hidden"
    >
      <div className="flex flex-col h-full" style={{ width: width || 400 }}>
        <div className="flex items-center justify-between p-4 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
          <h3
            className="text-lg font-medium truncate flex-1 mr-4"
            title={title}
          >
            {title}
          </h3>
          <div
            className="cursor-pointer p-1 hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] rounded transition-colors"
            onClick={onClose}
          >
            <CloseOutlined className="text-gray-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {content ? (
            <Editor
              ref={editorRef}
              initValue={content}
              onChange={handleContentChange}
              extensions={extensions}
              uploadResource={uploadResource}
              className="min-h-full"
              readonly={false}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              加载中...
            </div>
          )}
        </div>
      </div>
    </ResizeableAndHideableSidebar>
  );
};

export default NotePanel;
