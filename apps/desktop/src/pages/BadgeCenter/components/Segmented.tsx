import { motion } from "motion/react";
import useThemeColors from "@/hooks/useThemeColors";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const Segmented = <T extends string>({
  options,
  value,
  onChange,
}: SegmentedProps<T>) => {
  const themeColors = useThemeColors();
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border p-1 ${themeColors.borderClass} ${themeColors.tagBgClass}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative rounded-full px-4 py-1.5 text-xs font-medium transition ${active ? themeColors.buttonTextClass : themeColors.textClass}`}
          >
            {active && (
              <motion.span
                layoutId="segmented-active"
                className={`absolute inset-0 rounded-full ${themeColors.primaryButtonClass}`}
                transition={{ type: "spring", stiffness: 360, damping: 30 }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default Segmented;
