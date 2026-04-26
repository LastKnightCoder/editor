import { memo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import dayjs from "dayjs";

interface MonthPickerProps {
  value: dayjs.Dayjs;
  onChange: (date: dayjs.Dayjs) => void;
}

const MONTHS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

const MonthPicker = memo(({ value, onChange }: MonthPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(value.year());
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const currentYear = value.year();
  const currentMonth = value.month();

  // Calculate panel position
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    }
  }, [isOpen]);

  // Close picker when clicking outside
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

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = dayjs().year(selectedYear).month(monthIndex).date(1);
    onChange(newDate);
    setIsOpen(false);
  };

  const handleYearChange = (increment: number) => {
    setSelectedYear((prev) => prev + increment);
  };

  return (
    <div className="relative flex-1 text-center">
      <button
        ref={triggerRef}
        className="border-none bg-transparent text-[15px] font-semibold text-gray-900 dark:text-gray-50 cursor-pointer p-1 px-2 rounded-md transition-all duration-200 hover:bg-gray-100 dark:hover:bg-zinc-700"
        onClick={() => setIsOpen(!isOpen)}
      >
        {value.format("YYYY年MM月")}
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && panelPosition.top > 0 && (
            <motion.div
              ref={panelRef}
              className="fixed bg-white dark:bg-[#222] rounded-xl shadow-xl dark:shadow-2xl p-4 z-9999 w-[280px] border border-black/5 dark:border-white/10 pointer-events-auto"
              style={{
                top: `${panelPosition.top}px`,
                left: `${panelPosition.left}px`,
              }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-center justify-between mb-4 px-1">
                <button
                  className="w-8 h-8 flex items-center justify-center border-none bg-transparent rounded-md cursor-pointer text-xl text-gray-500 dark:text-gray-400 transition-all duration-200 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-gray-50"
                  onClick={() => handleYearChange(-1)}
                >
                  ‹
                </button>
                <span className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">
                  {selectedYear}年
                </span>
                <button
                  className="w-8 h-8 flex items-center justify-center border-none bg-transparent rounded-md cursor-pointer text-xl text-gray-500 dark:text-gray-400 transition-all duration-200 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-gray-50"
                  onClick={() => handleYearChange(1)}
                >
                  ›
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {MONTHS.map((month, index) => {
                  const isCurrentMonth =
                    selectedYear === currentYear && index === currentMonth;
                  const isSelected =
                    selectedYear === value.year() && index === value.month();

                  return (
                    <button
                      key={month}
                      className={`relative h-10 border-none bg-transparent rounded-lg cursor-pointer transition-all duration-200 text-[13px] font-medium hover:bg-gray-100 dark:hover:bg-zinc-700 ${
                        isCurrentMonth
                          ? "text-indigo-500 dark:text-indigo-200 font-semibold"
                          : "text-gray-600 dark:text-gray-300"
                      } ${
                        isSelected
                          ? "text-white font-semibold hover:bg-transparent"
                          : ""
                      }`}
                      onClick={() => handleMonthSelect(index)}
                    >
                      {isSelected && (
                        <motion.div
                          className="absolute inset-0 bg-indigo-500 rounded-lg -z-10"
                          layoutId="selectedMonth"
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 30,
                          }}
                        />
                      )}
                      <span className="relative z-1">{month}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
});

MonthPicker.displayName = "MonthPicker";

export default MonthPicker;
