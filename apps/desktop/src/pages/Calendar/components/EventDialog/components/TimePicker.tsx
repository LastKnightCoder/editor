import { FC, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";

interface TimePickerProps {
  value: string; // "HH:MM" format
  onChange: (time: string) => void;
  disabled?: boolean;
  label: string;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

const TimePicker: FC<TimePickerProps> = ({
  value,
  onChange,
  disabled = false,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editValue, setEditValue] = useState(value || "09:00");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    width: 0,
  });

  // Parse current time
  const [hours, minutes] = value ? value.split(":").map(Number) : [9, 0];
  const [selectedHour, setSelectedHour] = useState(hours);
  const [selectedMinute, setSelectedMinute] = useState(minutes);

  const calculatePosition = useMemoizedFn((): Position => {
    if (!triggerRef.current || !panelRef.current) {
      return { top: 0, left: 0, width: 0 };
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelHeight = 280;

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
      width: triggerRect.width,
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

  // Sync selected time when value changes
  useEffect(() => {
    if (value) {
      const [h, m] = value.split(":").map(Number);
      setSelectedHour(h);
      setSelectedMinute(m);
      setEditValue(value);
    }
  }, [value]);

  const handleConfirm = useMemoizedFn(() => {
    const timeString = `${selectedHour.toString().padStart(2, "0")}:${selectedMinute.toString().padStart(2, "0")}`;
    onChange(timeString);
    setIsOpen(false);
  });

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

  const handleNow = () => {
    const now = new Date();
    setSelectedHour(now.getHours());
    setSelectedMinute(now.getMinutes());
  };

  // Handle button click - open panel only if not clicking on input
  const handleButtonClick = (e: React.MouseEvent) => {
    if (disabled) return;

    // If clicking on the input, don't open panel
    if (e.target === inputRef.current) {
      return;
    }

    setIsOpen(true);
  };

  // Handle input focus - select all text
  const handleInputFocus = () => {
    if (disabled) return;
    // Select all text when focused
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  };

  // Handle input blur - validate and update
  const handleInputBlur = () => {
    validateAndUpdateTime(editValue);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  };

  // Handle input key down
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      setEditValue(value || "09:00");
      inputRef.current?.blur();
    }
  };

  // Validate and update time
  const validateAndUpdateTime = (timeStr: string) => {
    // Try to parse various time formats
    const cleaned = timeStr.replace(/[^\d:]/g, "");

    // Match HH:MM or HHMM or H:MM or HH:M etc.
    let hours: number | null = null;
    let minutes: number | null = null;

    if (cleaned.includes(":")) {
      const parts = cleaned.split(":");
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
    } else if (cleaned.length === 3 || cleaned.length === 4) {
      // HHMM or HMM format
      if (cleaned.length === 4) {
        hours = parseInt(cleaned.substring(0, 2), 10);
        minutes = parseInt(cleaned.substring(2, 4), 10);
      } else {
        hours = parseInt(cleaned.substring(0, 1), 10);
        minutes = parseInt(cleaned.substring(1, 3), 10);
      }
    }

    // Validate
    if (
      hours !== null &&
      minutes !== null &&
      !isNaN(hours) &&
      !isNaN(minutes) &&
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      const formattedTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      onChange(formattedTime);
      setEditValue(formattedTime);
    } else {
      // Invalid input, revert to previous value
      setEditValue(value || "09:00");
    }
  };

  // Generate hour and minute options
  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
        {label}
      </label>

      {/* Trigger Button with Embedded Input */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleButtonClick}
        disabled={disabled}
        className="w-full px-4 py-3.5 rounded-xl text-sm text-left flex items-center justify-between outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner focus-within:border-indigo-500 focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          disabled={disabled}
          className="bg-transparent border-none outline-none text-gray-800 dark:text-white text-sm w-20 p-0 disabled:cursor-not-allowed"
          placeholder="HH:MM"
        />
        <svg
          className="w-4 h-4 ml-2 flex-shrink-0 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {/* Time Picker Panel Portal */}
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
                {/* Time Display */}
                <div className="text-center mb-4">
                  <div className="text-2xl font-bold text-gray-800 dark:text-white">
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
                    <div className="h-40 overflow-y-auto rounded-lg bg-white/20 dark:bg-black/20 p-1">
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
                    <div className="h-40 overflow-y-auto rounded-lg bg-white/20 dark:bg-black/20 p-1">
                      {minuteOptions.map((minute) => (
                        <button
                          key={minute}
                          ref={
                            selectedMinute === minute ? selectedMinuteRef : null
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
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

export default TimePicker;
