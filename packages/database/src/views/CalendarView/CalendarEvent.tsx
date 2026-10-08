import React, { memo } from "react";

interface CalendarEventProps {
  title: string;
  color: string;
  spanType: "single" | "start" | "middle" | "end";
  left: string;
  width: string;
  top: string;
  onClick: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const CalendarEvent: React.FC<CalendarEventProps> = memo(
  ({ title, color, spanType, left, width, top, onClick, onMouseDown, onContextMenu }) => {
    // 根据 spanType 调整圆角样式
    let borderRadius = "4px";
    if (spanType === "start") {
      borderRadius = "4px 0 0 4px";
    } else if (spanType === "end") {
      borderRadius = "0 4px 4px 0";
    } else if (spanType === "middle") {
      borderRadius = "0";
    }

    return (
      <div
        onClick={onClick}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        className="text-ink-inverse pointer-events-auto absolute flex cursor-pointer items-center text-xs shadow-sm transition-opacity hover:opacity-90"
        style={{
          backgroundColor: color,
          left,
          width,
          top,
          height: "18px",
          paddingLeft: "6px",
          paddingRight: "6px",
          fontSize: "11px",
          borderRadius,
        }}
        title={title}
      >
        <div className="truncate font-medium">{title}</div>
      </div>
    );
  }
);

CalendarEvent.displayName = "CalendarEvent";

export default CalendarEvent;
