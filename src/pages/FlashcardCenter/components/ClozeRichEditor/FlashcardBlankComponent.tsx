import { useState } from "react";
import { RenderElementProps } from "slate-react";
import { FlashcardBlankElement } from "@/components/Editor/types/element/flashcard-blank";
import InlineChromiumBugfix from "@/components/Editor/components/InlineChromiumBugFix";
import BlankConfigPopover from "./BlankConfigPopover";

interface FlashcardBlankComponentProps {
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
  element: FlashcardBlankElement;
  isDark: boolean;
}

const FlashcardBlankComponent = ({
  attributes,
  children,
  element,
  isDark,
}: FlashcardBlankComponentProps) => {
  const [showConfig, setShowConfig] = useState(false);

  return (
    <span
      {...attributes}
      className="flashcard-blank-inline"
      style={{
        backgroundColor: isDark
          ? "rgba(59, 130, 246, 0.25)"
          : "rgba(59, 130, 246, 0.15)",
        padding: "2px 6px",
        borderRadius: "4px",
        border: `1px solid ${isDark ? "rgba(59, 130, 246, 0.4)" : "rgba(59, 130, 246, 0.3)"}`,
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        margin: "0 2px",
      }}
    >
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />

      {/* 配置按钮 */}
      <span
        contentEditable={false}
        onClick={() => setShowConfig(!showConfig)}
        className="blank-config-icon"
        style={{
          marginLeft: "4px",
          cursor: "pointer",
          fontSize: "14px",
          userSelect: "none",
        }}
        title="配置空格"
      >
        ⚙️
      </span>

      {/* 提示文本显示 */}
      {element.placeholder && (
        <span
          contentEditable={false}
          className="blank-hint"
          style={{
            marginLeft: "4px",
            fontSize: "11px",
            opacity: 0.7,
            fontStyle: "italic",
          }}
        >
          ({element.placeholder})
        </span>
      )}

      {/* 配置弹窗 */}
      {showConfig && (
        <BlankConfigPopover
          element={element}
          onClose={() => setShowConfig(false)}
          isDark={isDark}
        />
      )}
    </span>
  );
};

export default FlashcardBlankComponent;
