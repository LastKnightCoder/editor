import classNames from "classnames";
import { motion } from "motion/react";
import useThemeColors from "@/hooks/useThemeColors";

export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
}

interface AnimatedSegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
  className?: string;
}

function AnimatedSegmented<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  className,
}: AnimatedSegmentedProps<T>) {
  const themeColors = useThemeColors();
  return (
    <div
      className={classNames(
        "inline-flex items-center gap-1 rounded-xl border p-1 backdrop-blur-md",
        themeColors.glassPanelBg,
        themeColors.cardBorderClass,
        className,
      )}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={classNames(
              "relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200",
              active
                ? "text-[var(--th-btn-text)]"
                : themeColors.secondaryTextClass,
            )}
          >
            {active && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-[var(--th-btn-bg)] shadow-sm"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10 whitespace-nowrap">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default AnimatedSegmented;
