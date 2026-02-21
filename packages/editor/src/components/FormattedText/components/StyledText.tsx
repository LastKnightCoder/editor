import React, { memo, useMemo } from "react";
import { RenderLeafProps } from "slate-react";

interface StyledTextProps {
  children: React.ReactNode;
  className: string;
  textDecoration: string;
  color?: string;
  textGradient?: string;
  gradientFallbackColor?: string;
  attributes: RenderLeafProps["attributes"];
}

const preventDefault = (e: React.DragEvent) => {
  e.preventDefault();
};

const StyledText = memo(
  ({
    children,
    className,
    textDecoration,
    color = "inherit",
    textGradient,
    gradientFallbackColor,
    attributes,
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
      <span
        {...attributes}
        className={className}
        style={style}
        onDragStart={preventDefault}
        onDrop={preventDefault}
      >
        {children}
      </span>
    );
  },
);

StyledText.displayName = "StyledText";

export default StyledText;
