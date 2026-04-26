import { FC, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";
import type { ColumnDef } from "./types";

interface ColumnDropdownProps {
  columns: ColumnDef[];
  selectedId?: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  allowClear?: boolean;
  label?: string;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

const ColumnDropdown: FC<ColumnDropdownProps> = ({
  columns,
  selectedId,
  onSelect,
  disabled = false,
  placeholder = "选择列",
  allowClear = false,
  label,
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

  const handleSelect = useMemoizedFn((id: string) => {
    onSelect(id);
    setIsOpen(false);
  });

  const handleClear = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect("");
  });

  const selectedColumn = columns.find((c) => c.id === selectedId);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          {label}
        </label>
      )}
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full px-4 py-3.5 rounded-xl text-sm text-left flex items-center justify-between outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span
          className={`truncate ${!selectedColumn ? "text-gray-400 dark:text-slate-500" : ""}`}
        >
          {selectedColumn?.title || placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {allowClear && selectedId && !disabled && (
            <svg
              onClick={handleClear}
              className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6M9 9l6 6" />
            </svg>
          )}
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Dropdown Portal */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={dropdownRef}
              data-column-dropdown="true"
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
              <div className="py-2 max-h-[300px] overflow-y-auto">
                {columns.length === 0 ? (
                  <div className="px-3 mx-2 py-2 text-sm text-gray-400 dark:text-slate-500">
                    暂无可选列
                  </div>
                ) : (
                  columns.map((col) => {
                    const isSelected = col.id === selectedId;

                    return (
                      <div
                        key={col.id}
                        onClick={() => handleSelect(col.id)}
                        className={`
                          px-3 mx-2 mb-1 last:mb-0 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer
                          ${
                            isSelected
                              ? "bg-white/40 dark:bg-white/10 text-blue-600 dark:text-blue-400 border border-white/40 dark:border-white/20"
                              : "text-gray-700 dark:text-gray-200 hover:bg-white/20 dark:hover:bg-white/8"
                          }
                        `}
                      >
                        <div className="truncate">{col.title}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

export default ColumnDropdown;
