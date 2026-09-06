import { FC, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";
import { ResourceType } from "@/types";

interface TypeSelectProps {
  value: ResourceType | "all";
  onChange: (value: ResourceType | "all") => void;
  options: Array<{ label: string; value: ResourceType | "all" }>;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

const TypeSelect: FC<TypeSelectProps> = ({ value, onChange, options }) => {
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

    const spaceBelow = viewportHeight - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;

    let top: number;
    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
      top = triggerRect.bottom + gap;
    } else {
      top = triggerRect.top - dropdownHeight - gap;
    }

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

  const handleSelect = useMemoizedFn((val: ResourceType | "all") => {
    onChange(val);
    setIsOpen(false);
  });

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-[160px] items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm text-gray-800 shadow-inner outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white"
      >
        <span className="truncate">{selectedOption?.label || "选择类型"}</span>
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
                {options.map(opt => {
                  const isSelected = opt.value === value;

                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleSelect(opt.value)}
                      className={`mx-2 mb-1 cursor-pointer rounded-lg px-3 py-2 text-sm transition-all duration-150 last:mb-0 ${
                        isSelected
                          ? "border border-white/40 bg-white/40 font-medium text-[var(--th-active-text)] dark:border-white/20 dark:bg-white/10"
                          : "text-gray-700 hover:bg-white/20 dark:text-gray-200 dark:hover:bg-white/10"
                      } `}
                    >
                      <div className="truncate">{opt.label}</div>
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

export default TypeSelect;
