import type { HighlightColor } from "../types";
import { HIGHLIGHT_COLORS } from "../types";

const COLORS: HighlightColor[] = ["pink", "purple", "blue", "green", "orange"];

interface ColorPickerProps {
  position: { x: number; y: number };
  visible: boolean;
  selectedColor: HighlightColor;
  showDelete?: boolean;
  onColorSelect: (color: HighlightColor) => void;
  onConfirm: () => void;
  onDelete?: () => void;
}

export default function ColorPicker({
  position,
  visible,
  selectedColor,
  showDelete,
  onColorSelect,
  onConfirm,
  onDelete,
}: ColorPickerProps) {
  if (!visible) return null;

  const stopEvent = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
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
      className="tau-color-picker"
      onMouseDown={stopEvent}
    >
      <div className="tau-color-picker-colors">
        {COLORS.map((color) => (
          <button
            key={color}
            className={`tau-color-dot ${selectedColor === color ? "tau-color-dot-selected" : ""}`}
            style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
            onClick={() => onColorSelect(color)}
            title={color}
          />
        ))}
      </div>
      <div className="tau-color-picker-actions">
        <button className="tau-color-confirm" onClick={onConfirm} title="确认">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
        {showDelete && onDelete && (
          <button
            className="tau-color-delete"
            onClick={onDelete}
            title="删除划线"
          >
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
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
