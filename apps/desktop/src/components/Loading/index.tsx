import React from "react";
import useThemeColors from "@/hooks/useThemeColors";

type LoadingSize = "sm" | "md" | "lg";

interface LoadingProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string;
  description?: string;
  fullscreen?: boolean;
  size?: LoadingSize;
}

const spinnerSizeClasses: Record<LoadingSize, string> = {
  sm: "w-8 h-8 border-2",
  md: "w-12 h-12 border-[3px]",
  lg: "w-16 h-16 border-4",
};

const glowInsetClasses: Record<LoadingSize, string> = {
  sm: "inset-1",
  md: "inset-1",
  lg: "inset-2",
};

const Loading: React.FC<LoadingProps> = (props) => {
  const {
    message = "",
    description,
    fullscreen = false,
    size = "sm",
    className = "",
    children,
    role,
    style,
    ["aria-live"]: ariaLive,
    ...restProps
  } = props;

  const themeColors = useThemeColors();
  const accentTextClass =
    themeColors.iconTextClass || themeColors.activeTextClass || "";
  const glowBgClass = themeColors.tagBgClass || themeColors.activeBgClass || "";

  const wrapperClasses = fullscreen
    ? "fixed inset-0 z-50 flex items-center justify-center"
    : "flex items-center justify-center w-full py-8";

  const contentClasses = [
    "flex flex-col items-center gap-3 text-center rounded-2xl px-8 py-6 transition-all duration-200",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={[wrapperClasses, className].filter(Boolean).join(" ")}
      role={role ?? "status"}
      aria-live={ariaLive ?? "polite"}
      aria-busy="true"
      style={style}
      {...restProps}
    >
      <div className={contentClasses}>
        <div className="relative flex items-center justify-center">
          <div
            className={`absolute ${glowInsetClasses[size]} rounded-full blur-lg opacity-60 ${glowBgClass}`}
            aria-hidden="true"
          />
          <div
            className={`animate-spin rounded-full border-solid border-current border-t-transparent border-r-transparent ${spinnerSizeClasses[size]} ${accentTextClass}`}
          />
        </div>

        <div className="flex flex-col gap-1">
          {message && (
            <p
              className={`text-sm font-semibold mt-2 ${themeColors.activeTextClass}`}
            >
              {message}
            </p>
          )}
          {description && (
            <p className={`text-xs ${themeColors.secondaryTextClass}`}>
              {description}
            </p>
          )}
        </div>

        {children && <div className="w-full pt-1">{children}</div>}
      </div>
    </div>
  );
};

export default Loading;
