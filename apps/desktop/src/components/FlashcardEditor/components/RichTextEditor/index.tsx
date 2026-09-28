import { useRef, useEffect, useCallback } from "react";
import { getFlashcardKit } from "@/services/editorKit";
import { Descendant } from "slate";
import { Editor, EditorRef } from "@tau/editor/src";
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

  return (
    <div
      className="bg-surface border-line-1 rounded-tau-md overflow-hidden border"
      style={{ minHeight }}
    >
      <Editor
        kit={getFlashcardKit({ blanks: allowBlanks })}
        ref={editorRef}
        initValue={value}
        onChange={newValue => onChange(newValue)}
        onInit={handleEditorInit}
        readonly={false}
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
