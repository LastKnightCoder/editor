import { FC, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption {
  label: string;
  value: string | number;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string | number | undefined;
  onChange: (value: string | number | undefined) => void;
  placeholder?: string;
}

const Dropdown: FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = "选择...",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

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

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="
          min-w-[140px] h-8 px-3 rounded-xl
          bg-white/90 dark:bg-zinc-800/90
          backdrop-blur-sm
          border border-gray-200/60 dark:border-slate-600/60
          text-sm text-gray-700 dark:text-slate-300
          hover:bg-white dark:hover:bg-zinc-700
          hover:border-gray-300 dark:hover:border-slate-500
          transition-all duration-200
          flex items-center justify-between gap-2
        "
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="
              absolute z-50 mt-2 min-w-[160px] max-h-[300px] overflow-auto p-2
              rounded-2xl
              bg-white/95 dark:bg-zinc-900/90
              backdrop-blur-xl saturate-150
              border border-white/50 dark:border-white/10
              shadow-[0_18px_45px_rgba(15,23,42,0.25)]
              dark:shadow-[0_22px_60px_rgba(2,6,23,0.7)]
            "
            style={{ left: 0, top: "100%" }}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`
                    w-full px-3 py-2 text-sm text-left rounded-xl mb-0.5
                    flex items-center justify-between gap-2
                    transition-colors duration-150
                    ${
                      isSelected
                        ? "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
                        : "text-gray-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-zinc-700/60"
                    }
                  `}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dropdown;
