import { useState } from "react";
import { RenderElementProps } from "slate-react";
import { InlineChromiumBugfix } from "@tau/editor";
import type { FlashcardBlankElement } from "../types";
import BlankConfigPopover from "./BlankConfigPopover";

interface FlashcardBlankProps {
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
  element: FlashcardBlankElement;
}

const FlashcardBlank = ({ attributes, children, element }: FlashcardBlankProps) => {
  const [showConfig, setShowConfig] = useState(false);

  return (
    <span
      {...attributes}
      className="flashcard-blank-inline"
      style={{
        backgroundColor: "var(--ed-info-soft)",
        padding: "1px 8px",
        borderRadius: "4px",
        border: "1px solid var(--ed-info)",
        position: "relative",
        display: "inline",
        margin: "0 1px",
        verticalAlign: "baseline",
        lineHeight: "inherit",
        fontWeight: "500",
        color: "var(--ed-info)",
      }}
    >
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />

      {/* 配置按钮 - 始终显示 */}
      <span
        contentEditable={false}
        onClick={() => setShowConfig(!showConfig)}
        className="blank-config-icon"
        style={{
          marginLeft: "6px",
          cursor: "pointer",
          fontSize: "12px",
          userSelect: "none",
          opacity: 0.7,
          transition: "opacity 0.2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
        title="配置空格"
      >
        ⚙️
      </span>

      {/* 提示文本显示 - 更简洁 */}
      {element.placeholder && (
        <span
          contentEditable={false}
          className="blank-hint"
          style={{
            marginLeft: "4px",
            fontSize: "10px",
            opacity: 0.6,
            fontStyle: "italic",
            fontWeight: "normal",
          }}
        >
          {element.placeholder}
        </span>
      )}

      {/* 配置弹窗 */}
      {showConfig && <BlankConfigPopover element={element} onClose={() => setShowConfig(false)} />}
    </span>
  );
};

export default FlashcardBlank;
