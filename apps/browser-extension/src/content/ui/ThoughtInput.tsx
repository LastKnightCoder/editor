import { useState, useEffect, useRef, useCallback } from "react";
import type { Annotation } from "../types";

interface ThoughtInputProps {
  mode: "view" | "edit";
  visible: boolean;
  initialText?: string;
  annotation?: Annotation | null;
  onSubmit: (text: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ThoughtInput({
  mode,
  visible,
  initialText = "",
  annotation,
  onSubmit,
  onEdit,
  onDelete,
  onClose,
}: ThoughtInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整 textarea 高度
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // 编辑态：打开时用 initialText 预填内容
  useEffect(() => {
    if (visible && mode === "edit") {
      setText(initialText);
      requestAnimationFrame(adjustHeight);
    }
  }, [visible, mode, initialText, adjustHeight]);

  if (!visible) return null;

  // --- 查看态（底部固定卡片） ---
  if (mode === "view" && annotation) {
    return (
      <div
        className="tau-thought-input"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 右上角关闭按钮 */}
        <button className="tau-thought-input-close" onClick={onClose}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="tau-thought-input-body">
          <p className="tau-thought-view-text">{annotation.text}</p>
        </div>

        <div className="tau-thought-input-footer">
          <button
            className="tau-thought-view-action"
            onClick={onDelete}
            title="删除"
          >
            删除
          </button>
          <button className="tau-thought-submit" onClick={onEdit}>
            编辑
          </button>
        </div>
      </div>
    );
  }

  // --- 编辑态 ---
  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    adjustHeight();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="tau-thought-input" onMouseDown={(e) => e.stopPropagation()}>
      {/* 右上角关闭按钮 */}
      <button className="tau-thought-input-close" onClick={onClose}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* textarea 区域，带内联思考图标 */}
      <div className="tau-thought-input-body">
        <div className="tau-thought-textarea-wrap">
          <svg
            className="tau-thought-textarea-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <textarea
            ref={textareaRef}
            className="tau-thought-textarea"
            placeholder="写下这一刻的想法"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
      </div>

      {/* 底部 footer */}
      <div className="tau-thought-input-footer">
        <div />
        <button
          className="tau-thought-submit"
          onClick={handleSubmit}
          disabled={!text.trim()}
        >
          保存
        </button>
      </div>
    </div>
  );
}
