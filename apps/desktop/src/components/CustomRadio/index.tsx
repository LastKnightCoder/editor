import React, { useState, useEffect } from "react";
import classnames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import "./index.css";

interface CustomRadioProps {
  checked: boolean;
  onChange: () => void;
  className?: string;
  disabled?: boolean;
  label?: string;
}

const CustomRadio: React.FC<CustomRadioProps> = ({
  checked,
  onChange,
  className,
  disabled,
  label,
}) => {
  const themeColors = useThemeColors();
  const [isChecked, setIsChecked] = useState(checked);
  const [showRipple, setShowRipple] = useState(false);
  const radioAccentColor = themeColors.accentColor || themeColors.twoToneColor || "#6366f1";

  useEffect(() => {
    setIsChecked(checked);
  }, [checked]);

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    setIsChecked(true);

    setShowRipple(true);
    setTimeout(() => {
      setShowRipple(false);
    }, 400);

    onChange();
  };

  return (
    <label
      className={classnames(
        "flex cursor-pointer select-none items-center gap-2 transition-opacity",
        { "cursor-not-allowed opacity-60": disabled },
        className
      )}
      onClick={handleClick}
    >
      <div className="relative h-4 w-4 flex-shrink-0">
        <svg
          className="h-full w-full"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            strokeWidth="2"
            className={classnames(
              "transition-all duration-300",
              isChecked ? "stroke-[var(--th-accent)]" : "stroke-gray-300 dark:stroke-slate-600"
            )}
            style={isChecked ? { stroke: radioAccentColor } : undefined}
          />
          {isChecked && (
            <circle
              cx="12"
              cy="12"
              r="4.5"
              className="animate-[radioDot_0.3s_cubic-bezier(0.78,0.14,0.15,0.86)]"
              style={{ fill: radioAccentColor }}
            />
          )}
        </svg>

        {showRipple && (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 animate-[ripple_0.4s_ease-out] rounded-full border-2"
            style={{ borderColor: radioAccentColor }}
          />
        )}
      </div>
      {label && (
        <span className="text-sm text-gray-700 group-hover:text-gray-900 dark:text-gray-200 dark:group-hover:text-white">
          {label}
        </span>
      )}
    </label>
  );
};

export default CustomRadio;
