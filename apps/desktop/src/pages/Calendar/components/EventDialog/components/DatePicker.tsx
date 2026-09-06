import { FC, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";
import dayjs from "dayjs";

interface DatePickerProps {
  value: string; // "YYYY-MM-DD" format
  onChange: (date: string) => void;
  disabled?: boolean;
  label: string;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

const DatePicker: FC<DatePickerProps> = ({ value, onChange, disabled = false, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    width: 0,
  });

  // Current viewing month (for calendar navigation)
  const [viewDate, setViewDate] = useState(() => (value ? dayjs(value) : dayjs()));

  const calculatePosition = useMemoizedFn((): Position => {
    if (!triggerRef.current || !panelRef.current) {
      return { top: 0, left: 0, width: 0 };
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelHeight = 320; // Approximate calendar height

    const viewportHeight = window.innerHeight;
    const gap = 8;

    const spaceBelow = viewportHeight - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;

    let top: number;
    if (spaceBelow >= panelHeight || spaceBelow >= spaceAbove) {
      top = triggerRect.bottom + gap;
    } else {
      top = triggerRect.top - panelHeight - gap;
    }

    top = Math.max(gap, Math.min(top, viewportHeight - panelHeight - gap));

    return {
      top,
      left: triggerRect.left,
      width: Math.max(triggerRect.width, 280),
    };
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const updatePosition = () => {
      if (isOpen && triggerRef.current) {
        const newPosition = calculatePosition();
        setPosition(newPosition);
      }
    };

    if (isOpen) {
      setTimeout(updatePosition, 0);
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, calculatePosition]);

  const handleDateSelect = useMemoizedFn((date: dayjs.Dayjs) => {
    onChange(date.format("YYYY-MM-DD"));
    setIsOpen(false);
  });

  const handlePrevMonth = () => {
    setViewDate(viewDate.subtract(1, "month"));
  };

  const handleNextMonth = () => {
    setViewDate(viewDate.add(1, "month"));
  };

  const handleToday = () => {
    const today = dayjs();
    setViewDate(today);
    onChange(today.format("YYYY-MM-DD"));
    setIsOpen(false);
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const startOfMonth = viewDate.startOf("month");
    const endOfMonth = viewDate.endOf("month");
    const startDate = startOfMonth.startOf("week");
    const endDate = endOfMonth.endOf("week");

    const days: dayjs.Dayjs[] = [];
    let current = startDate;

    while (current.isBefore(endDate) || current.isSame(endDate, "day")) {
      days.push(current);
      current = current.add(1, "day");
    }

    return days;
  };

  const calendarDays = generateCalendarDays();
  const selectedDate = value ? dayjs(value) : null;
  const today = dayjs();

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
        {label}
      </label>

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left text-sm text-gray-800 shadow-inner outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-950 dark:text-white"
      >
        <span>{value ? dayjs(value).format("YYYY年MM月DD日") : "选择日期"}</span>
        <svg
          className="ml-2 h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {/* Calendar Panel Portal */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={panelRef}
              className="fixed rounded-2xl border border-white/30 bg-white/60 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-md backdrop-saturate-150 dark:border-white/20 dark:bg-[rgba(30,30,30,0.6)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]"
              style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                width: `${position.width}px`,
                zIndex: 10000,
              }}
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <div className="p-4">
                {/* Header */}
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="rounded-lg p-1.5 transition-colors hover:bg-white/20 dark:hover:bg-white/10"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>

                  <div className="text-sm font-semibold text-gray-800 dark:text-white">
                    {viewDate.format("YYYY年MM月")}
                  </div>

                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="rounded-lg p-1.5 transition-colors hover:bg-white/20 dark:hover:bg-white/10"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>

                {/* Weekday Headers */}
                <div className="mb-2 grid grid-cols-7 gap-1">
                  {["一", "二", "三", "四", "五", "六", "日"].map(day => (
                    <div
                      key={day}
                      className="py-1 text-center text-xs font-medium text-gray-500 dark:text-slate-400"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, index) => {
                    const isCurrentMonth = day.month() === viewDate.month();
                    const isSelected = selectedDate && day.isSame(selectedDate, "day");
                    const isToday = day.isSame(today, "day");

                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleDateSelect(day)}
                        className={`h-8 rounded-lg text-xs transition-all ${!isCurrentMonth ? "text-gray-400 dark:text-slate-600" : "text-gray-700 dark:text-gray-200"} ${
                          isSelected
                            ? "bg-[var(--th-btn-bg)] font-semibold text-[var(--th-btn-text)]"
                            : isToday
                              ? "border border-indigo-500 bg-white/40 font-semibold dark:bg-white/10"
                              : "dark:hover:bg-white/8 hover:bg-white/20"
                        } `}
                      >
                        {day.date()}
                      </button>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="mt-3 border-t border-white/20 pt-3 dark:border-white/10">
                  <button
                    type="button"
                    onClick={handleToday}
                    className="w-full rounded-lg bg-white/20 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-white/30 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15"
                  >
                    今天
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default DatePicker;
