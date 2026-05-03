import { FC, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";
import dayjs from "dayjs";

interface DateTimePickerProps {
  label: string;
  value: dayjs.Dayjs | null;
  onChange: (value: dayjs.Dayjs | null) => void;
  required?: boolean;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

const DateTimePicker: FC<DateTimePickerProps> = ({
  label,
  value,
  onChange,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    width: 0,
  });

  // Temporary state for picker
  const [viewDate, setViewDate] = useState(() => value || dayjs());
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(value);
  const [selectedHour, setSelectedHour] = useState(value?.hour() || 9);
  const [selectedMinute, setSelectedMinute] = useState(value?.minute() || 0);

  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);

  const calculatePosition = useMemoizedFn((): Position => {
    if (!triggerRef.current || !panelRef.current) {
      return { top: 0, left: 0, width: 0 };
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelHeight = 420;

    const viewportHeight = window.innerHeight;
    const gap = 8;

    const spaceBelow = viewportHeight - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;

    let top: number;
    // 优先向下显示，但如果空间不足且上方空间更大，则向上显示
    if (spaceBelow >= panelHeight) {
      top = triggerRect.bottom + gap;
    } else if (spaceAbove > spaceBelow && spaceAbove >= panelHeight) {
      top = triggerRect.top - panelHeight - gap;
    } else {
      // 空间都不够时，优先向上显示并限制在视口内
      top = Math.max(gap, triggerRect.top - panelHeight - gap);
    }

    // 确保不超出视口
    top = Math.max(gap, Math.min(top, viewportHeight - panelHeight - gap));

    return {
      top,
      left: triggerRect.left,
      width: Math.max(triggerRect.width, 320),
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

  useEffect(() => {
    if (value) {
      setViewDate(value);
      setSelectedDate(value);
      setSelectedHour(value.hour());
      setSelectedMinute(value.minute());
    }
  }, [value]);

  const scrollToSelectedOption = useMemoizedFn(
    (target: HTMLButtonElement | null): void => {
      if (!target) return;
      target.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    },
  );

  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      scrollToSelectedOption(selectedHourRef.current);
      scrollToSelectedOption(selectedMinuteRef.current);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, selectedHour, selectedMinute, scrollToSelectedOption]);

  const handleDateSelect = (date: dayjs.Dayjs) => {
    setSelectedDate(date);
    setViewDate(date);
  };

  const handleConfirm = () => {
    if (selectedDate) {
      const result = selectedDate
        .hour(selectedHour)
        .minute(selectedMinute)
        .second(0)
        .millisecond(0);
      onChange(result);
    }
    setIsOpen(false);
  };

  const handleNow = () => {
    const now = dayjs();
    setSelectedDate(now);
    setViewDate(now);
    setSelectedHour(now.hour());
    setSelectedMinute(now.minute());
  };

  const handlePrevMonth = () => {
    setViewDate(viewDate.subtract(1, "month"));
  };

  const handleNextMonth = () => {
    setViewDate(viewDate.add(1, "month"));
  };

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
  const today = dayjs();
  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3.5 rounded-xl text-sm text-left flex items-center justify-between outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]"
      >
        <span>
          {value ? value.format("YYYY年MM月DD日 HH:mm") : "选择日期和时间"}
        </span>
        <svg
          className="w-4 h-4 ml-2 shrink-0"
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

      {/* DateTime Picker Panel Portal */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={panelRef}
              className="fixed rounded-2xl bg-white/60 dark:bg-[rgba(30,30,30,0.6)] backdrop-blur-md backdrop-saturate-150 border border-white/30 dark:border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]"
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
                {/* Calendar Section */}
                <div className="mb-4">
                  {/* Calendar Header */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="p-1.5 rounded-lg hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
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
                      className="p-1.5 rounded-lg hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
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
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                      <div
                        key={day}
                        className="text-center text-xs font-medium text-gray-500 dark:text-slate-400 py-1"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Days */}
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, index) => {
                      const isCurrentMonth = day.month() === viewDate.month();
                      const isSelected =
                        selectedDate && day.isSame(selectedDate, "day");
                      const isToday = day.isSame(today, "day");

                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleDateSelect(day)}
                          className={`
                            h-8 rounded-lg text-xs transition-all
                            ${!isCurrentMonth ? "text-gray-400 dark:text-slate-600" : "text-gray-700 dark:text-gray-200"}
                            ${
                              isSelected
                                ? "bg-indigo-500 text-white font-semibold"
                                : isToday
                                  ? "bg-white/40 dark:bg-white/10 font-semibold border border-indigo-500"
                                  : "hover:bg-white/20 dark:hover:bg-white/8"
                            }
                          `}
                        >
                          {day.date()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Section */}
                <div className="border-t border-white/20 dark:border-white/10 pt-4">
                  <div className="text-center mb-3">
                    <div className="text-xl font-bold text-gray-800 dark:text-white">
                      {selectedHour.toString().padStart(2, "0")}:
                      {selectedMinute.toString().padStart(2, "0")}
                    </div>
                  </div>

                  {/* Hour and Minute Selectors */}
                  <div className="flex gap-2 mb-4">
                    {/* Hour Selector */}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2 text-center">
                        小时
                      </div>
                      <div className="h-32 overflow-y-auto rounded-lg bg-white/20 dark:bg-black/20 p-1">
                        {hourOptions.map((hour) => (
                          <button
                            key={hour}
                            ref={selectedHour === hour ? selectedHourRef : null}
                            type="button"
                            onClick={() => setSelectedHour(hour)}
                            className={`w-full py-1.5 rounded text-sm transition-all ${
                              selectedHour === hour
                                ? "bg-indigo-500 text-white font-semibold"
                                : "hover:bg-white/20 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
                            }`}
                          >
                            {hour.toString().padStart(2, "0")}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Minute Selector */}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2 text-center">
                        分钟
                      </div>
                      <div className="h-32 overflow-y-auto rounded-lg bg-white/20 dark:bg-black/20 p-1">
                        {minuteOptions.map((minute) => (
                          <button
                            key={minute}
                            ref={
                              selectedMinute === minute
                                ? selectedMinuteRef
                                : null
                            }
                            type="button"
                            onClick={() => setSelectedMinute(minute)}
                            className={`w-full py-1.5 rounded text-sm transition-all ${
                              selectedMinute === minute
                                ? "bg-indigo-500 text-white font-semibold"
                                : "hover:bg-white/20 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
                            }`}
                          >
                            {minute.toString().padStart(2, "0")}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Footer Buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleNow}
                      className="flex-1 py-2 rounded-lg text-xs font-medium bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/15 transition-colors text-gray-700 dark:text-gray-200"
                    >
                      现在
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      className="flex-1 py-2 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
                    >
                      确定
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

export default DateTimePicker;
