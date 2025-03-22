import React, { memo } from "react";
import { RenderLeafProps } from "slate-react";

interface StyledTextProps {
  children: React.ReactNode;
  className: string;
  textDecoration: string;
  color?: string;
  attributes: RenderLeafProps["attributes"];
  onDragStart: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

const StyledText = memo(
  ({
    children,
    className,
    textDecoration,
    color,
    attributes,
    onDragStart,
    onDrop,
  }: StyledTextProps) => {
    return (
      <span
        {...attributes}
        className={className}
        style={{
          textDecoration,
          color,
        }}
        onDragStart={onDragStart}
        onDrop={onDrop}
      >
        {children}
      </span>
    );
  },
);

StyledText.displayName = "StyledText";

export default StyledText;
