import React, { useState, useEffect } from "react";
import "../animations.css";
import { cn } from "@tau/ui";

const styles = {
  checkboxContainer: "relative mt-[0.2em] size-[1.25em] shrink-0 cursor-pointer",
  checkbox: "size-full",
  checkboxRect:
    "fill-transparent stroke-[var(--checkbox-border-color,var(--tau-line-1))] transition-all duration-300 ease-[cubic-bezier(0.78,0.14,0.15,0.86)]",
  checked:
    "fill-[var(--checkbox-active-color,var(--tau-accent))] stroke-[var(--checkbox-active-color,var(--tau-accent))]",
  checkmark:
    "stroke-[var(--tau-ink-inverse)] [stroke-dasharray:20] [stroke-dashoffset:20] animate-[tau-checkbox-check_0.3s_cubic-bezier(0.65,0,0.45,1)_forwards]",
  fireworks: "pointer-events-none absolute left-1/2 top-1/2 size-0",
  particle:
    "absolute size-[0.375em] origin-center rounded-full bg-[var(--checkbox-active-color,var(--tau-accent))] opacity-0 animate-[tau-checkbox-particle_0.4s_ease-out_forwards] [animation-delay:var(--delay,0s)]",
};

interface CustomCheckboxProps {
  checked: boolean;
  onChange: () => void;
  className?: string;
  readonly?: boolean;
  accentColor?: string;
}

type CheckboxCSSVars = React.CSSProperties & {
  "--checkbox-active-color"?: string;
};

const CustomCheckbox: React.FC<CustomCheckboxProps> = ({
  checked,
  onChange,
  className,
  readonly,
  accentColor,
}) => {
  const [isChecked, setIsChecked] = useState(checked);
  const [showFireworks, setShowFireworks] = useState(false);
  const checkboxAccentColor = accentColor || "var(--tau-accent)";
  const checkboxVars: CheckboxCSSVars = {
    "--checkbox-active-color": checkboxAccentColor,
  };

  useEffect(() => {
    setIsChecked(checked);
  }, [checked]);

  const handleClick = (e: React.MouseEvent) => {
    if (readonly) return;
    e.preventDefault();
    e.stopPropagation();

    const newChecked = !isChecked;
    setIsChecked(newChecked);

    if (newChecked) {
      setShowFireworks(true);
      setTimeout(() => {
        setShowFireworks(false);
      }, 500);
    }

    onChange();
  };

  return (
    <div
      className={cn(styles.checkboxContainer, className)}
      onClick={handleClick}
      style={checkboxVars}
    >
      <svg
        className={styles.checkbox}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          className={cn(styles.checkboxRect, isChecked && styles.checked)}
          x="2"
          y="2"
          width="20"
          height="20"
          rx="4"
          strokeWidth="2"
        />
        {isChecked && (
          <path
            className={styles.checkmark}
            d="M7 13L10 16L17 9"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {showFireworks && (
        <div className={styles.fireworks}>
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className={styles.particle}
              style={
                {
                  "--angle": `${i * 30}deg`,
                  "--delay": `${i * 0.05}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomCheckbox;
