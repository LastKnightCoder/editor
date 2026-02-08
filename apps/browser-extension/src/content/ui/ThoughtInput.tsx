import { useState } from "react";

interface ThoughtInputProps {
  visible: boolean;
  onSubmit: (text: string) => void;
  onClose: () => void;
}

export default function ThoughtInput({
  visible,
  onSubmit,
  onClose,
}: ThoughtInputProps) {
  const [text, setText] = useState("");

  if (!visible) return null;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
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
      <div className="tau-thought-input-header">
        <span className="tau-thought-input-title">写想法</span>
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
      </div>
      <div className="tau-thought-input-body">
        <textarea
          className="tau-thought-textarea"
          placeholder="写下这一刻的想法"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={3}
        />
        <button
          className="tau-thought-submit"
          onClick={handleSubmit}
          disabled={!text.trim()}
        >
          发表
        </button>
      </div>
    </div>
  );
}
