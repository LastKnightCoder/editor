import React, { useMemo, useRef } from "react";
import { X } from "lucide-react";
import { IconButton, Loading } from "@tau/ui";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import useEditContent from "@/hooks/useEditContent";
import { getEditorText } from "@/utils/editor";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { FadeScroll } from "@/components/FadeScroll";
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
      className="bg-surface shadow-float ring-line-1 z-50 flex h-full flex-col overflow-hidden rounded-[14px] ring-1"
    >
      <div
        className="flex h-full flex-col"
        style={{ width: width || 400 }}
        data-whiteboard-stop-keyboard="true"
        onKeyDownCapture={stopKeyboardPropagation}
        onKeyUpCapture={stopKeyboardPropagation}
      >
        {/* 头部与正文靠留白分层，不画分隔线 */}
        <div className="flex h-12 flex-none items-center gap-3 pl-5 pr-2.5">
          <h3
            className="text-ink-1 min-w-0 flex-1 truncate text-[14px] font-semibold"
            title={title}
          >
            {title}
          </h3>
          <IconButton aria-label="关闭笔记" className="size-7" onClick={onClose}>
            <X size={15} strokeWidth={1.75} />
          </IconButton>
        </div>
        <FadeScroll className="mb-3 min-h-0 flex-1 pb-2 pl-5 pr-3.5">
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
            <Loading />
          )}
        </FadeScroll>
      </div>
    </ResizeableAndHideableSidebar>
  );
};

export default NotePanel;
