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
        "inline-flex items-center gap-0.5 rounded-lg bg-[var(--th-hover-bg)] p-0.5",
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
              "relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200",
              active
                ? "text-[var(--th-active-text)]"
                : themeColors.secondaryTextClass,
              !active && "hover:text-[var(--th-hover-text)]",
            )}
          >
            {active && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-[var(--th-card-bg)] shadow-sm"
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
