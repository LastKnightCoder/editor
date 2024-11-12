import React from 'react';
import WidthResizable from "@/components/WidthResizable";
import useDragAndHideSidebar from "@/hooks/useDragAndHideSidebar.ts";

interface ResizeableAndHideableSidebarProps {
  width: number;
  open: boolean;
  onWidthChange?: (width: number) => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  minWidth?: number;
  maxWidth?: number;
  side?: 'left' | 'right';
}

const ResizeableAndHideableSidebar = (props: ResizeableAndHideableSidebarProps) => {
  const {
    width,
    open,
    onWidthChange,
    className,
    style,
    children,
    minWidth = 200,
    maxWidth = 500,
    side,
  } = props;

  const scope = useDragAndHideSidebar({
    width,
    open,
  });

  return (
    <div ref={scope} style={{ ...style, width }} className={className}>
      <WidthResizable
        defaultWidth={width}
        minWidth={minWidth}
        maxWidth={maxWidth}
        onResize={(width) => {
          onWidthChange?.(width);
        }}
        style={{
          height: '100%'
        }}
        side={side}
      >
        {children}
      </WidthResizable>
    </div>
  )
}

export default ResizeableAndHideableSidebar;
