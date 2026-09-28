import { useState } from "react";
import { Transforms } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import type { FlashcardBlankElement } from "../types";

interface BlankConfigPopoverProps {
  element: FlashcardBlankElement;
  onClose: () => void;
}

const BlankConfigPopover = ({ element, onClose }: BlankConfigPopoverProps) => {
  const editor = useSlateStatic();
  const [placeholder, setPlaceholder] = useState(element.placeholder || "");
  const [answer, setAnswer] = useState(element.answer || "");
  const [alternatives, setAlternatives] = useState<string[]>(element.alternativeAnswers || []);

  const handleSave = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        placeholder: placeholder.trim(),
        answer: answer.trim(),
        alternativeAnswers: alternatives.filter(alt => alt.trim()).map(alt => alt.trim()),
      } as Partial<FlashcardBlankElement>,
      { at: path }
    );
    onClose();
  };

  const handleAddAlternative = () => {
    setAlternatives([...alternatives, ""]);
  };

  const handleRemoveAlternative = (index: number) => {
    setAlternatives(alternatives.filter((_, i) => i !== index));
  };

  const handleAlternativeChange = (index: number, value: string) => {
    const newAlternatives = [...alternatives];
    newAlternatives[index] = value;
    setAlternatives(newAlternatives);
  };

  return (
    <div
      contentEditable={false}
      className="blank-config-popover"
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: 0,
        zIndex: 1000,
        backgroundColor: "var(--ed-bg-surface)",
        border: "1px solid var(--ed-border)",
        borderRadius: "8px",
        padding: "16px",
        minWidth: "280px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="form-section" style={{ marginBottom: "12px" }}>
        <label
          className="form-label"
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "var(--ed-text)",
          }}
        >
          提示文本（可选）
        </label>
        <input
          type="text"
          value={placeholder}
          onChange={e => setPlaceholder(e.target.value)}
          placeholder="如：国家名、人物、年份等"
          className="form-input"
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid var(--ed-border)",
            backgroundColor: "var(--ed-bg-surface)",
            color: "var(--ed-text)",
            fontSize: "14px",
            outline: "none",
          }}
        />
        <p
          className="form-hint"
          style={{
            fontSize: "11px",
            color: "var(--ed-text-secondary)",
            marginTop: "4px",
          }}
        >
          显示为：___（{placeholder || "提示"}）
        </p>
      </div>

      <div className="form-section" style={{ marginBottom: "12px" }}>
        <label
          className="form-label"
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "var(--ed-text)",
          }}
        >
          正确答案 *
        </label>
        <input
          type="text"
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder="输入正确答案"
          className="form-input"
          required
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid var(--ed-border)",
            backgroundColor: "var(--ed-bg-surface)",
            color: "var(--ed-text)",
            fontSize: "14px",
            outline: "none",
          }}
        />
      </div>

      <div className="form-section" style={{ marginBottom: "16px" }}>
        <label
          className="form-label"
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "6px",
            color: "var(--ed-text)",
          }}
        >
          备选答案（可选）
        </label>
        {alternatives.map((alt, index) => (
          <div
            key={index}
            className="alternative-input-group"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <input
              type="text"
              value={alt}
              onChange={e => handleAlternativeChange(index, e.target.value)}
              placeholder={`备选答案 ${index + 1}`}
              className="form-input"
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--ed-border)",
                backgroundColor: "var(--ed-bg-surface)",
                color: "var(--ed-text)",
                fontSize: "14px",
                outline: "none",
              }}
            />
            <button
              onClick={() => handleRemoveAlternative(index)}
              className="remove-button"
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "4px",
                border: "none",
                backgroundColor: "var(--ed-danger-soft)",
                color: "var(--ed-danger)",
                fontSize: "18px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handleAddAlternative}
          className="add-alternative-button"
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: "6px",
            border: "1px dashed var(--ed-border)",
            backgroundColor: "transparent",
            color: "var(--ed-text-secondary)",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          + 添加备选答案
        </button>
      </div>

      <div
        className="form-actions"
        style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
      >
        <button
          onClick={onClose}
          className="button-secondary"
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid var(--ed-border)",
            backgroundColor: "transparent",
            color: "var(--ed-text)",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          取消
        </button>
        <button
          onClick={handleSave}
          className="button-primary"
          disabled={!answer.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            backgroundColor: answer.trim() ? "#3b82f6" : "#94a3b8",
            color: "white",
            fontSize: "14px",
            cursor: answer.trim() ? "pointer" : "not-allowed",
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
};

export default BlankConfigPopover;
