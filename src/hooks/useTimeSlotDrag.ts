import { useState, useCallback, MouseEvent, useRef } from "react";
import { roundToQuarterHour } from "@/utils/calendar";

interface TimeRange {
  start: number; // 分钟数
  end: number; // 分钟数
}

interface UseTimeSlotDragOptions {
  onSelect: (start: number, end: number) => void;
  cellHeight: number; // 每个时间单元格的高度（px）
  gridStartTime?: number; // 网格开始时间（分钟），默认 0 (00:00)
}

/**
 * 处理时间网格的拖拽选择
 */
export const useTimeSlotDrag = ({
  onSelect,
  cellHeight,
  gridStartTime = 0,
}: UseTimeSlotDragOptions) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedRange, setSelectedRange] = useState<TimeRange | null>(null);
  const startMinutesRef = useRef<number>(0);
  const currentRangeRef = useRef<TimeRange | null>(null);

  // 将鼠标位置转换为分钟数
  const positionToMinutes = useCallback(
    (posY: number, containerTop: number): number => {
      const relativeY = Math.max(0, posY - containerTop);
      const minutesPerCell = 15; // 每个单元格 15 分钟
      const minutes = (relativeY / cellHeight) * minutesPerCell;
      return roundToQuarterHour(
        Math.min(1440, Math.max(0, minutes + gridStartTime)),
      );
    },
    [cellHeight, gridStartTime],
  );

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const container = e.currentTarget;
      const containerRect = container.getBoundingClientRect();
      const startMinutes = positionToMinutes(e.clientY, containerRect.top);

      startMinutesRef.current = startMinutes;
      const initialRange = { start: startMinutes, end: startMinutes + 15 };
      setIsDragging(true);
      setSelectedRange(initialRange);
      currentRangeRef.current = initialRange;

      const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
        const currentMinutes = positionToMinutes(
          moveEvent.clientY,
          containerRect.top,
        );
        const start = Math.min(startMinutesRef.current, currentMinutes);
        const end = Math.max(startMinutesRef.current, currentMinutes);
        const newRange = { start, end: Math.max(start + 15, end) };
        setSelectedRange(newRange);
        currentRangeRef.current = newRange;
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        // 使用 ref 中的最新值
        if (currentRangeRef.current) {
          onSelect(currentRangeRef.current.start, currentRangeRef.current.end);
        }
        setSelectedRange(null);
        currentRangeRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [positionToMinutes, onSelect],
  );

  return {
    isDragging,
    selectedRange,
    handlers: {
      onMouseDown: handleMouseDown,
    },
  };
};
