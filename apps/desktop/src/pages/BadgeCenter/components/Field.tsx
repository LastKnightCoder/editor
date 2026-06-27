import type { ReactNode } from "react";
import useThemeColors from "@/hooks/useThemeColors";

export interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

const Field = ({ label, hint, children }: FieldProps) => {
  const themeColors = useThemeColors();
  return (
    <label className="grid gap-2">
      <span
        className={`text-xs font-medium uppercase tracking-wider ${themeColors.secondaryTextClass}`}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span className={`text-xs ${themeColors.secondaryTextClass}`}>
          {hint}
        </span>
      )}
    </label>
  );
};

export default Field;
