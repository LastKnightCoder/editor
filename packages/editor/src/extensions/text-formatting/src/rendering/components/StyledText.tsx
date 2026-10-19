import React, { memo, useMemo } from "react";

interface StyledTextProps {
  children: React.ReactNode;
  className: string;
  textDecoration: string;
  color?: string;
  textGradient?: string;
  gradientFallbackColor?: string;
}

const StyledText = memo(
  ({
    children,
    className,
    textDecoration,
    color = "inherit",
    textGradient,
    gradientFallbackColor,
  }: StyledTextProps) => {
    const style = useMemo(() => {
      if (textGradient) {
        return {
          textDecoration,
          color: gradientFallbackColor || "inherit",
          backgroundImage: textGradient,
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        };
      }
      return {
        textDecoration,
        color,
      };
    }, [textDecoration, color, textGradient, gradientFallbackColor]);

    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }
);

StyledText.displayName = "StyledText";

export default StyledText;
