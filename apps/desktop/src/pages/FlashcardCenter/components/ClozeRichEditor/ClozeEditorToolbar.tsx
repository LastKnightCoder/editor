import { Editor, Range, Element as SlateElement } from "slate";
import { wrapAsBlank, unwrapBlank } from "./utils";

interface ClozeEditorToolbarProps {
  editor: Editor;
  isDark: boolean;
}

const ClozeEditorToolbar = ({ editor, isDark }: ClozeEditorToolbarProps) => {
  const handleToggleBlank = () => {
    const { selection } = editor;

    // 检查是否有选中内容
    if (!selection || Range.isCollapsed(selection)) {
      alert("请先选中需要标记为空格的文字");
      return;
    }

    // 检查当前选中的文本是否已经是空格
    const [blank] = Editor.nodes(editor, {
      match: (n) =>
        !Editor.isEditor(n) &&
        SlateElement.isElement(n) &&
        n.type === "flashcard-blank",
    });

    if (blank) {
      unwrapBlank(editor);
    } else {
      wrapAsBlank(editor);
    }
  };

  return (
    <div
      className={`cloze-toolbar ${isDark ? "dark" : "light"}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderTop: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "#e5e7eb"}`,
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.02)"
          : "rgba(0, 0, 0, 0.02)",
      }}
    >
      <button
        type="button"
        onClick={handleToggleBlank}
        className="toolbar-button"
        style={{
          padding: "8px 16px",
          borderRadius: "8px",
          border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.15)" : "#d1d5db"}`,
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.05)"
            : "white",
          color: isDark ? "white" : "#374151",
          fontSize: "14px",
          fontWeight: "500",
          cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        标记为空格
      </button>

      <span
        className="toolbar-hint"
        style={{
          fontSize: "12px",
          color: isDark ? "rgba(255, 255, 255, 0.5)" : "#9ca3af",
        }}
      >
        提示：选中文字后点击按钮即可标记为空格
      </span>
    </div>
  );
};

export default ClozeEditorToolbar;
