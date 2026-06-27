import { motion } from "motion/react";
import useThemeColors from "@/hooks/useThemeColors";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}

const Toggle = ({ checked, onChange, label, description }: ToggleProps) => {
  const themeColors = useThemeColors();
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <div>
          {label && (
            <div
              className={`text-sm font-medium ${themeColors.activeTextClass}`}
            >
              {label}
            </div>
          )}
          {description && (
            <div className={`mt-0.5 text-xs ${themeColors.secondaryTextClass}`}>
              {description}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          checked ? themeColors.primaryButtonClass : themeColors.tagBgClass
        }`}
      >
        <motion.span
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
          animate={{ left: checked ? 24 : 4 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </button>
    </div>
  );
};

export default Toggle;
