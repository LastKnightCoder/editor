import { useMemo, useCallback } from "react";
import { createEditor, Descendant } from "slate";
import { Slate, Editable, withReact, RenderElementProps } from "slate-react";
import { withHistory } from "slate-history";
import { createInlineElementPlugin } from "@tau/editor/src";
import { FlashcardBlankElement } from "@tau/editor/src";
import FlashcardBlankComponent from "./FlashcardBlankComponent";
import ClozeEditorToolbar from "./ClozeEditorToolbar";

interface ClozeRichEditorProps {
  value: Descendant[];
  onChange: (value: Descendant[]) => void;
  isDark: boolean;
}

const ClozeRichEditor = ({ value, onChange, isDark }: ClozeRichEditorProps) => {
  // 创建编辑器（仅初始化一次）
  const editor = useMemo(() => {
    const base = withHistory(withReact(createEditor()));
    // 注册 flashcard-blank 为 inline 元素
    return createInlineElementPlugin("flashcard-blank")(base);
  }, []);

  const renderElement = useCallback(
    (props: RenderElementProps) => {
      if (props.element.type === "flashcard-blank") {
        return (
          <FlashcardBlankComponent
            {...props}
            element={props.element as FlashcardBlankElement}
            isDark={isDark}
          />
        );
      }
      if (props.element.type === "paragraph") {
        return <p {...props.attributes}>{props.children}</p>;
      }
      return <span {...props.attributes}>{props.children}</span>;
    },
    [isDark],
  );

  return (
    <div
      className={`cloze-editor-wrapper ${isDark ? "dark" : "light"}`}
      style={{
        backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : "#f9fafb",
        borderRadius: "12px",
        border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "#e5e7eb"}`,
        overflow: "hidden",
      }}
    >
      <Slate editor={editor} initialValue={value} onChange={onChange}>
        <div
          className="cloze-editor-container"
          style={{
            padding: "16px",
            minHeight: "200px",
          }}
        >
          <Editable
            renderElement={renderElement}
            placeholder="输入填空题内容，选中文字后点击下方按钮标记为空格..."
            className="cloze-editable"
            style={{
              outline: "none",
              fontSize: "15px",
              lineHeight: "1.8",
              color: isDark ? "white" : "#1e293b",
            }}
          />
        </div>
        <ClozeEditorToolbar editor={editor} isDark={isDark} />
      </Slate>
    </div>
  );
};

export default ClozeRichEditor;
