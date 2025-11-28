import { useMemo } from "react";
import { Editor, Range, Element as SlateElement } from "slate";
import { useSlateSelection } from "slate-react";
import { wrapAsBlank, unwrapBlank } from "./utils";

interface ClozeEditorToolbarProps {
  editor: Editor;
  isDark: boolean;
}

const ClozeEditorToolbar = ({ editor, isDark }: ClozeEditorToolbarProps) => {
  const selection = useSlateSelection();

  // 检查当前选中的文本是否已经是空格
  const isBlankActive = useMemo(() => {
    if (!selection || Range.isCollapsed(selection)) return false;
    const [blank] = Editor.nodes(editor, {
      match: (n) =>
        !Editor.isEditor(n) &&
        SlateElement.isElement(n) &&
        n.type === "flashcard-blank",
    });
    return !!blank;
  }, [editor, selection]);

  const hasSelection = useMemo(() => {
    return selection && !Range.isCollapsed(selection);
  }, [selection]);

  const handleToggleBlank = () => {
    if (!hasSelection) {
      alert("请先选中需要标记为空格的文字");
      return;
    }

    if (isBlankActive) {
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
        disabled={!hasSelection}
        className={`toolbar-button ${isBlankActive ? "active" : ""}`}
        style={{
          padding: "8px 16px",
          borderRadius: "8px",
          border: isBlankActive
            ? isDark
              ? "1px solid #3b82f6"
              : "1px solid #3b82f6"
            : `1px solid ${isDark ? "rgba(255, 255, 255, 0.15)" : "#d1d5db"}`,
          backgroundColor: isBlankActive
            ? isDark
              ? "rgba(59, 130, 246, 0.15)"
              : "rgba(59, 130, 246, 0.1)"
            : isDark
              ? "rgba(255, 255, 255, 0.05)"
              : "white",
          color: isBlankActive ? "#3b82f6" : isDark ? "white" : "#374151",
          fontSize: "14px",
          fontWeight: "500",
          cursor: hasSelection ? "pointer" : "not-allowed",
          opacity: hasSelection ? 1 : 0.5,
          transition: "all 0.2s",
        }}
      >
        {isBlankActive ? "取消空格标记" : "标记为空格"}
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
