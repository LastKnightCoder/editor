import { memo, useRef } from "react";
import type { Descendant } from "slate";
import { useMemoizedFn, useUnmount } from "ahooks";

import Editor, { EditorRef } from "@/components/Editor";
import useUploadResource from "@/hooks/useUploadResource";
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
    const uploadResource = useUploadResource();

    const { throttleHandleEditorContentChange } = useEditContent(
      contentId,
      (content) => {
        editorRef.current?.setEditorValue(content);
        onContentChange?.(content);
      },
    );

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
        ref={editorRef}
        extensions={extensions}
        initValue={initialValue}
        onChange={handleContentChange}
        readonly={false}
        uploadResource={uploadResource}
        placeHolder={placeholder}
        className={className}
      />
    );
  },
);

export default DiaryContentEditor;
