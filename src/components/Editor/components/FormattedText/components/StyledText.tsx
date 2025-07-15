import React, { memo, useMemo } from "react";
import { RenderLeafProps } from "slate-react";

interface StyledTextProps {
  children: React.ReactNode;
  className: string;
  textDecoration: string;
  color?: string;
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
    color,
    attributes,
  }: StyledTextProps) => {
    const style = useMemo(() => {
      return {
        textDecoration,
        color,
      };
    }, [textDecoration, color]);

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
