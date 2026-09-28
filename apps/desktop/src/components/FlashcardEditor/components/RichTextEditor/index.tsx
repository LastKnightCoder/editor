import { useRef, useEffect, useMemo, useCallback } from "react";
import { getDesktopKit } from "@/services/editorKit";
import { Descendant } from "slate";
import { Editor, EditorRef, IExtension } from "@tau/editor/src";
import FlashcardBlankExtension from "@/editor-extensions/flashcard-blank";
import ClozeEditorToolbar from "../ClozeRichEditor/ClozeEditorToolbar";

interface RichTextEditorProps {
  value: Descendant[];
  onChange: (value: Descendant[]) => void;
  allowBlanks?: boolean;
  isDark: boolean;
  placeholder?: string;
  minHeight?: string;
}

const RichTextEditor = ({
  value,
  onChange,
  allowBlanks = false,
  isDark,
  placeholder = "输入内容...",
  minHeight = "120px",
}: RichTextEditorProps) => {
  const editorRef = useRef<EditorRef>(null);
  const valueRef = useRef<Descendant[]>(value);

  // 保持 valueRef 与最新的 value 同步
  valueRef.current = value;

  // Editor onInit 回调，确保编辑器初始化后同步最新的 value
  const handleEditorInit = useCallback(() => {
    if (editorRef.current && valueRef.current) {
      const currentValue = JSON.stringify(editorRef.current.getEditor().children);
      const newValue = JSON.stringify(valueRef.current);

      if (currentValue !== newValue) {
        editorRef.current.setEditorValue(valueRef.current);
      }
    }
  }, []);

  // 当 value prop 改变时，更新编辑器内容
  useEffect(() => {
    if (editorRef.current && value) {
      const currentValue = JSON.stringify(editorRef.current.getEditor().children);
      const newValue = JSON.stringify(value);

      if (currentValue !== newValue) {
        editorRef.current.setEditorValue(value);
      }
    }
  }, [value]);

  // 配置扩展
  const extensions = useMemo<IExtension[]>(() => {
    if (!allowBlanks) {
      return [];
    }

    return [new FlashcardBlankExtension()];
  }, [allowBlanks, isDark]);

  return (
    <div
      className="bg-surface border-line-1 rounded-tau-md overflow-hidden border"
      style={{ minHeight }}
    >
      <Editor
        kit={getDesktopKit()}
        ref={editorRef}
        initValue={value}
        onChange={newValue => onChange(newValue)}
        onInit={handleEditorInit}
        readonly={false}
        extensions={extensions}
        placeHolder={placeholder}
        style={{
          padding: "16px",
          minHeight,
          fontSize: "15px",
          lineHeight: "1.8",
        }}
      />
      {allowBlanks && editorRef.current && (
        <ClozeEditorToolbar editor={editorRef.current.getEditor()} isDark={isDark} />
      )}
    </div>
  );
};

export default RichTextEditor;
