import { useState, useCallback, MouseEvent, useRef } from "react";

interface DateRange {
  start: number; // 日期索引
  end: number; // 日期索引
}

interface UseDateRangeDragOptions {
  onSelect: (startDate: number, endDate: number) => void;
}

/**
 * 处理月视图中的日期范围拖拽选择
 */
export const useDateRangeDrag = ({ onSelect }: UseDateRangeDragOptions) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedRange, setSelectedRange] = useState<DateRange | null>(null);
  const startIndexRef = useRef<number>(0);

  const handleMouseDown = useCallback(
    (dayIndex: number) => (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      startIndexRef.current = dayIndex;
      setIsDragging(true);
      setSelectedRange({ start: dayIndex, end: dayIndex });
    },
    [],
  );

  const handleMouseEnter = useCallback(
    (dayIndex: number) => {
      if (!isDragging) return;

      const start = Math.min(startIndexRef.current, dayIndex);
      const end = Math.max(startIndexRef.current, dayIndex);
      setSelectedRange({ start, end });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging && selectedRange) {
      // 触发选择回调
      onSelect(selectedRange.start, selectedRange.end);
    }
    setIsDragging(false);
    setSelectedRange(null);
  }, [isDragging, selectedRange, onSelect]);

  return {
    isDragging,
    selectedRange,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
  };
};
