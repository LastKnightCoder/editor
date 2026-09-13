import { memo, useRef } from "react";
import type { Descendant } from "slate";
import { useMemoizedFn, useUnmount } from "ahooks";

import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import useEditContent from "@/hooks/useEditContent";

interface DiaryContentEditorProps {
  contentId?: number;
  initialValue: Descendant[];
  placeholder?: string;
  className?: string;
  extensions?: any[];
  onContentChange?: (value: Descendant[]) => void;
}

const DiaryContentEditor = memo(
  ({
    contentId,
    initialValue,
    placeholder,
    className,
    extensions = [],
    onContentChange,
  }: DiaryContentEditorProps) => {
    const editorRef = useRef<EditorRef | null>(null);

    // 投影回显只回填编辑器；外传会被上层当作用户编辑触发 update-diary-segment 写库（对齐 CardItem 惯例）
    const { throttleHandleEditorContentChange } = useEditContent(contentId, content => {
      editorRef.current?.setEditorValue(content);
    });

    const handleContentChange = useMemoizedFn((value: Descendant[]) => {
      throttleHandleEditorContentChange(value);
      onContentChange?.(value);
    });

    useUnmount(() => {
      throttleHandleEditorContentChange.flush();
    });

    if (!contentId) {
      return null;
    }

    return (
      <Editor
        contentId={contentId}
        ref={editorRef}
        extensions={extensions}
        initValue={initialValue}
        onChange={handleContentChange}
        readonly={false}
        placeHolder={placeholder}
        className={className}
      />
    );
  }
);

export default DiaryContentEditor;
