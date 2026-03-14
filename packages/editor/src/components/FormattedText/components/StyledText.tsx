import React, { memo, useMemo } from "react";
import { RenderLeafProps } from "slate-react";
import classnames from "classnames";

interface StyledTextProps {
  children: React.ReactNode;
  className: string;
  textDecoration: string;
  color?: string;
  textGradient?: string;
  gradientFallbackColor?: string;
  attributes: RenderLeafProps["attributes"];
  wrapperProps?: React.HTMLAttributes<HTMLSpanElement>;
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
    wrapperProps,
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

    const mergedStyle = useMemo(
      () => ({
        ...style,
        ...wrapperProps?.style,
      }),
      [style, wrapperProps?.style],
    );

    return (
      <span
        {...attributes}
        {...wrapperProps}
        className={classnames(className, wrapperProps?.className)}
        style={mergedStyle}
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
