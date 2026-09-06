import React, { useMemo, useRef } from "react";
import { CloseOutlined } from "@ant-design/icons";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import useEditContent from "@/hooks/useEditContent";
import { getEditorText } from "@/utils/editor";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

interface NotePanelProps {
  contentTitle?: string;
  contentId?: number;
  onClose: () => void;
}

const NotePanel: React.FC<NotePanelProps> = ({ contentId, onClose, contentTitle }) => {
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const { content, throttleHandleEditorContentChange } = useEditContent(contentId, data => {
    editorRef.current?.setEditorValue(data);
  });

  const editorRef = useRef<EditorRef>(null);

  const [width, setWidth] = useLocalStorageState<number>("note-panel-width", {
    defaultValue: 400,
  });

  const title = useMemo(() => {
    if (!content) return "加载中...";
    if (contentTitle) return contentTitle;
    const text = getEditorText(content, 20).trim();
    return text.length < 20 ? text : `${text}...` || "未命名笔记";
  }, [content, contentTitle]);

  const handleContentChange = useMemoizedFn((content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
  });

  const stopKeyboardPropagation = useMemoizedFn((event: React.KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  });

  return (
    <ResizeableAndHideableSidebar
      width={width || 400}
      open={!!contentId}
      onWidthChange={w => setWidth(w)}
      minWidth={200}
      maxWidth={600}
      side="left"
      className="z-50 flex h-full flex-col overflow-hidden border-l border-[#f0f0f0] bg-white dark:border-[#2a2a2a] dark:bg-[#1e1e1e]"
    >
      <div
        className="flex h-full flex-col"
        style={{ width: width || 400 }}
        data-whiteboard-stop-keyboard="true"
        onKeyDownCapture={stopKeyboardPropagation}
        onKeyUpCapture={stopKeyboardPropagation}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#f0f0f0] px-4 py-3 dark:border-[#2a2a2a]">
          <h3 className="min-w-0 flex-1 truncate text-base font-medium" title={title}>
            {title}
          </h3>
          <div
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a]"
            onClick={onClose}
          >
            <CloseOutlined className="text-gray-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {content ? (
            <Editor
              contentId={contentId}
              ref={editorRef}
              initValue={content}
              onChange={handleContentChange}
              extensions={dynamicExtensions}
              className="min-h-full"
              readonly={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">加载中...</div>
          )}
        </div>
      </div>
    </ResizeableAndHideableSidebar>
  );
};

export default NotePanel;
