import { memo } from "react";
import { motion } from "framer-motion";
import classNames from "classnames";

interface ViewOption {
  label: string;
  value: string;
}

interface ViewSwitcherProps {
  options: ViewOption[];
  value: string;
  onChange: (value: string) => void;
}

const ViewSwitcher = memo(({ options, value, onChange }: ViewSwitcherProps) => {
  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-1 bg-white/90 dark:bg-[rgba(20,20,20,0.9)] backdrop-blur-xl p-2 rounded-[10px] shadow-[0_2px_12px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.05)] border border-black/6 dark:border-white/10">
        {options.map((option) => (
          <button
            key={option.value}
            className={classNames(
              "relative py-1.5 px-4 border-none bg-transparent rounded-[7px] cursor-pointer text-[13px] font-medium transition-colors outline-none whitespace-nowrap",
              value === option.value
                ? "text-gray-800 dark:text-gray-50 font-semibold"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-50",
            )}
            onClick={() => onChange(option.value)}
            data-active={value === option.value}
          >
            {value === option.value && (
              <motion.div
                className="absolute inset-0 bg-white dark:bg-gray-700 rounded-[7px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)] -z-10"
                layoutId="activeTab"
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

ViewSwitcher.displayName = "ViewSwitcher";

export default ViewSwitcher;
