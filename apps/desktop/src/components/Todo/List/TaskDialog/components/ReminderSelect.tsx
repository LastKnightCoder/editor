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

  const selectedOption = REMINDER_OPTIONS.find((opt) => opt.value === value);

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
        className="w-full px-4 py-3.5 rounded-xl text-sm text-left flex items-center justify-between outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]"
      >
        <span>{selectedOption?.label || "不提醒"}</span>
        <svg
          className="w-4 h-4 ml-2 shrink-0"
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
              <div className="p-2 max-h-64 overflow-y-auto">
                {REMINDER_OPTIONS.map((option) => (
                  <button
                    key={option.value ?? "null"}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={`w-full px-3 py-2.5 rounded-lg text-sm text-left transition-all ${
                      value === option.value
                        ? "bg-indigo-500 text-white font-semibold"
                        : "hover:bg-white/20 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

export default ReminderSelect;
