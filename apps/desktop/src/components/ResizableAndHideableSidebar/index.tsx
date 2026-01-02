import React, { useState, useEffect } from "react";
import WidthResizable from "@/components/WidthResizable";
import SidebarToggleButton from "@/components/SidebarToggleButton";
import useDragAndHideSidebar from "@/hooks/useDragAndHideSidebar.ts";

interface ResizeableAndHideableSidebarProps {
  width: number;
  open: boolean;
  onWidthChange?: (width: number, actualWidth?: number) => void;
  onActualWidthChange?: (actualWidth: number) => void;
  onToggle?: () => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  minWidth?: number;
  maxWidth?: number;
  side?: "left" | "right";
  /** 侧边栏的位置（左侧或右侧），用于确定按钮显示位置 */
  sidebarPosition?: "left" | "right";
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
    onToggle,
    className,
    style,
    children,
    minWidth = 200,
    maxWidth = 500,
    side,
    sidebarPosition = "left",
    disableResize = false,
    handleOffset,
  } = props;

  const [isHoveringEdge, setIsHoveringEdge] = useState(false);

  useEffect(() => {
    setIsHoveringEdge(false);
  }, [open]);

  const ref = useDragAndHideSidebar<HTMLDivElement>({
    width,
    open,
    onWidthChange,
  });

  useEffect(() => {
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
    <div
      ref={ref}
      style={{ ...style, width }}
      className={`${className || ""} relative`}
    >
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
        className="h-full"
      >
        {children}
      </WidthResizable>

      {onToggle && open && (
        <div
          className={`absolute ${sidebarPosition === "left" ? "right-0" : "left-0"} top-0 bottom-0 w-6 z-5`}
          onMouseEnter={() => setIsHoveringEdge(true)}
          onMouseLeave={() => setIsHoveringEdge(false)}
        >
          {/* 收起按钮 */}
          <div
            className={`transition-opacity duration-200 ${isHoveringEdge ? "opacity-100" : "opacity-0"}`}
            style={{ pointerEvents: isHoveringEdge ? "auto" : "none" }}
          >
            <SidebarToggleButton.Collapse
              onToggle={onToggle}
              side={sidebarPosition}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResizeableAndHideableSidebar;
