import { useState } from "react";
import type { Annotation } from "../types";

interface AnnotationPopoverProps {
  annotation: Annotation | null;
  position: { x: number; y: number };
  visible: boolean;
  onEdit: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function AnnotationPopover({
  annotation,
  position,
  visible,
  onEdit,
  onDelete,
  onClose,
}: AnnotationPopoverProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  if (!visible || !annotation) return null;

  const handleStartEdit = () => {
    setEditText(annotation.text);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed) {
      onEdit(trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translateX(-50%)",
        zIndex: 2147483647,
      }}
      className="tau-annotation-popover"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {isEditing ? (
        <div className="tau-annotation-edit">
          <textarea
            className="tau-annotation-textarea"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            rows={3}
          />
          <div className="tau-annotation-edit-actions">
            <button
              className="tau-annotation-btn tau-annotation-btn-save"
              onClick={handleSaveEdit}
            >
              保存
            </button>
            <button
              className="tau-annotation-btn"
              onClick={() => setIsEditing(false)}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="tau-annotation-view">
          <p className="tau-annotation-text">{annotation.text}</p>
          <div className="tau-annotation-actions">
            <button
              className="tau-annotation-action-btn"
              onClick={handleStartEdit}
              title="编辑"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              className="tau-annotation-action-btn tau-annotation-action-delete"
              onClick={onDelete}
              title="删除"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
