import { FC, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";
import type { Calendar } from "@/types";

interface CalendarDropdownProps {
  calendars: Calendar[];
  selectedId: number;
  onSelect: (id: number) => void;
  disabled?: boolean;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

const CalendarDropdown: FC<CalendarDropdownProps> = ({
  calendars,
  selectedId,
  onSelect,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    width: 0,
  });

  const calculatePosition = useMemoizedFn((): Position => {
    if (!triggerRef.current || !dropdownRef.current) {
      return { top: 0, left: 0, width: 0 };
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(dropdownRef.current.scrollHeight, 300);

    const viewportHeight = window.innerHeight;
    const gap = 8;

    // Calculate vertical position (above/below)
    const spaceBelow = viewportHeight - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;

    let top: number;
    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
      // Display below
      top = triggerRect.bottom + gap;
    } else {
      // Display above
      top = triggerRect.top - dropdownHeight - gap;
    }

    // Boundary limit
    top = Math.max(gap, Math.min(top, viewportHeight - dropdownHeight - gap));

    return {
      top,
      left: triggerRect.left,
      width: triggerRect.width,
    };
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
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
      // Need to delay position calculation to ensure DOM is rendered
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

  const handleSelect = useMemoizedFn((id: number) => {
    onSelect(id);
    setIsOpen(false);
  });

  const selectedCalendar = calendars.find(c => c.id === selectedId);

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left text-sm text-gray-800 shadow-inner outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-950 dark:text-white"
      >
        <span className="truncate">{selectedCalendar?.title || "选择日历"}</span>
        <svg
          className={`ml-2 h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown Portal */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={dropdownRef}
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
              <div className="max-h-[300px] overflow-y-auto py-2">
                {calendars
                  .filter(cal => !cal.isInSystemGroup)
                  .map(cal => {
                    const isSelected = cal.id === selectedId;

                    return (
                      <div
                        key={cal.id}
                        onClick={() => handleSelect(cal.id)}
                        className={`mx-2 mb-1 cursor-pointer rounded-lg px-3 py-2 text-sm transition-all duration-150 last:mb-0 ${
                          isSelected
                            ? "border border-white/40 bg-white/40 text-[var(--th-active-text)] dark:border-white/20 dark:bg-white/10"
                            : "dark:hover:bg-white/8 text-gray-700 hover:bg-white/20 dark:text-gray-200"
                        } `}
                      >
                        <div className="truncate">{cal.title}</div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default CalendarDropdown;
