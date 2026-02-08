import type { HighlightColor } from "../types";
import { HIGHLIGHT_COLORS } from "../types";

const COLORS: HighlightColor[] = ["pink", "purple", "blue", "green", "orange"];

interface ColorPickerProps {
  position: { x: number; y: number };
  visible: boolean;
  selectedColor: HighlightColor;
  onColorSelect: (color: HighlightColor) => void;
}

export default function ColorPicker({
  position,
  visible,
  selectedColor,
  onColorSelect,
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
    </div>
  );
}
