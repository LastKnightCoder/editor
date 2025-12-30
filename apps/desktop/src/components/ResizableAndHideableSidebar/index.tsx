import React from "react";
import WidthResizable from "@/components/WidthResizable";
import useDragAndHideSidebar from "@/hooks/useDragAndHideSidebar.ts";

interface ResizeableAndHideableSidebarProps {
  width: number;
  open: boolean;
  onWidthChange?: (width: number, actualWidth?: number) => void;
  onActualWidthChange?: (actualWidth: number) => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  minWidth?: number;
  maxWidth?: number;
  side?: "left" | "right";
  disableResize?: boolean;
  handleOffset?: number;
}

const ResizeableAndHideableSidebar = (
  props: ResizeableAndHideableSidebarProps,
) => {
  const {
    width,
    open,
    onWidthChange,
    onActualWidthChange,
    className,
    style,
    children,
    minWidth = 200,
    maxWidth = 500,
    side,
    disableResize = false,
    handleOffset,
  } = props;

  const ref = useDragAndHideSidebar<HTMLDivElement>({
    width,
    open,
    onWidthChange,
  });

  React.useEffect(() => {
    if (!onActualWidthChange || !ref.current) return;
    const element = ref.current;
    const observer = new ResizeObserver(() => {
      onActualWidthChange(element.offsetWidth);
    });
    observer.observe(element);
    onActualWidthChange(element.offsetWidth);
    return () => observer.disconnect();
  }, [onActualWidthChange]);

  return (
    <div ref={ref} style={{ ...style, width }} className={className || ""}>
      <WidthResizable
        defaultWidth={width}
        minWidth={minWidth}
        maxWidth={maxWidth}
        onResize={(width) => {
          onWidthChange?.(width, width);
        }}
        style={{
          height: "100%",
        }}
        side={side}
        disableResize={disableResize}
        handleOffset={handleOffset}
      >
        {children}
      </WidthResizable>
    </div>
  );
};

export default ResizeableAndHideableSidebar;
