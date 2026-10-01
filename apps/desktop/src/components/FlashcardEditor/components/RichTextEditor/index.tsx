import { useState } from "react";
import { getFlashcardKit } from "@/services/editorKit";
import { Descendant } from "slate";
import { Editor, EditorRef } from "@tau/editor";
import ClozeEditorToolbar from "../ClozeRichEditor/ClozeEditorToolbar";

interface RichTextEditorProps {
  initialValue: Descendant[];
  onChange: (value: Descendant[]) => void;
  allowBlanks?: boolean;
  isDark: boolean;
  placeholder?: string;
  minHeight?: string;
}

const RichTextEditor = ({
  initialValue,
  onChange,
  allowBlanks = false,
  isDark,
  placeholder = "输入内容...",
  minHeight = "120px",
}: RichTextEditorProps) => {
  const [editor, setEditor] = useState<ReturnType<EditorRef["getEditor"]> | null>(null);

  return (
    <div
      className="bg-surface border-line-1 rounded-tau-md overflow-hidden border"
      style={{ minHeight }}
    >
      <Editor
        kit={getFlashcardKit({ blanks: allowBlanks })}
        initValue={initialValue}
        onChange={newValue => onChange(newValue)}
        onInit={setEditor}
        readonly={false}
        placeHolder={placeholder}
        style={{
          padding: "16px",
          minHeight,
          fontSize: "15px",
          lineHeight: "1.8",
        }}
      />
      {allowBlanks && editor && <ClozeEditorToolbar editor={editor} isDark={isDark} />}
    </div>
  );
};

export default RichTextEditor;
