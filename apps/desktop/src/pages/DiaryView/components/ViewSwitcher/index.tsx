import { memo } from "react";
import { motion } from "motion/react";
import classNames from "classnames";
import { useThemeColors } from "@/hooks";
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
  const {
    hoverTextClass,
    activeTextClass,
    borderClass,
    tagBgClass,
    hoverClass,
    glassPanelBg,
  } = useThemeColors();

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50">
      <div
        className={`flex items-center gap-1 backdrop-blur-xl p-2 rounded-[10px] shadow-[0_2px_12px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.05)] border ${borderClass} ${glassPanelBg}`}
      >
        {options.map((option) => (
          <button
            key={option.value}
            className={classNames(
              "relative py-1.5 px-4 border-none bg-transparent rounded-[7px] cursor-pointer text-[13px] font-medium transition-all duration-200 outline-none whitespace-nowrap",
              value === option.value
                ? `${activeTextClass} font-semibold`
                : `text-gray-500 dark:text-gray-400 ${hoverTextClass} ${hoverClass}`,
            )}
            onClick={() => onChange(option.value)}
            data-active={value === option.value}
          >
            {value === option.value && (
              <motion.div
                className={`absolute inset-0 rounded-[7px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)] -z-10 ${tagBgClass}`}
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
