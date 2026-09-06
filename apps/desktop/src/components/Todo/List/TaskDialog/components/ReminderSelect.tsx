import { FC, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";

interface ReminderSelectProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

const REMINDER_OPTIONS = [
  { value: null, label: "不提醒" },
  { value: 0, label: "准时" },
  { value: 5 * 60 * 1000, label: "5分钟前" },
  { value: 10 * 60 * 1000, label: "10分钟前" },
  { value: 15 * 60 * 1000, label: "15分钟前" },
  { value: 30 * 60 * 1000, label: "30分钟前" },
  { value: 60 * 60 * 1000, label: "1小时前" },
  { value: 2 * 60 * 60 * 1000, label: "2小时前" },
  { value: 24 * 60 * 60 * 1000, label: "1天前" },
];

const ReminderSelect: FC<ReminderSelectProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    width: 0,
  });

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

  const handleSelect = (optionValue: number | null) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const selectedOption = REMINDER_OPTIONS.find(opt => opt.value === value);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
        提前提醒
      </label>

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left text-sm text-gray-800 shadow-inner outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white"
      >
        <span>{selectedOption?.label || "不提醒"}</span>
        <svg
          className="ml-2 h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown Panel Portal */}
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
              <div className="max-h-64 overflow-y-auto p-2">
                {REMINDER_OPTIONS.map(option => (
                  <button
                    key={option.value ?? "null"}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                      value === option.value
                        ? "bg-[var(--th-btn-bg)] font-semibold text-[var(--th-btn-text)]"
                        : "text-gray-700 hover:bg-white/20 dark:text-gray-200 dark:hover:bg-white/10"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default ReminderSelect;
