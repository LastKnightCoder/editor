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
  /**
   * 拖拽条所在的边。
   * 语义是“resize handle 在组件哪一侧”，不是“侧边栏停靠在哪一侧”。
   * 例如：
   * - 左侧侧边栏通常传 `right`
   * - 右侧侧边栏通常传 `left`
   */
  resizeHandleSide?: "left" | "right";
  /**
   * @deprecated 兼容旧调用，等价于 `resizeHandleSide`
   */
  side?: "left" | "right";
  /** 侧边栏的位置（左侧或右侧），用于确定按钮显示位置 */
  sidebarPosition?: "left" | "right";
  disableResize?: boolean;
  handleOffset?: number;
  /**
   * 收起后是否在边缘显示统一的 hover 展开按钮。
   * 适合“收起时完全不可见，只在边缘悬浮展开”的场景。
   */
  showInternalExpandButtonWhenClosed?: boolean;
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
    resizeHandleSide,
    side,
    sidebarPosition = "left",
    disableResize = false,
    handleOffset,
    showInternalExpandButtonWhenClosed = false,
  } = props;

  const [isHoveringEdge, setIsHoveringEdge] = useState(false);
  const resolvedResizeHandleSide = resizeHandleSide ?? side ?? "right";

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
      <div className={`h-full w-full ${open ? "" : "overflow-hidden"}`}>
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
          side={resolvedResizeHandleSide}
          disableResize={disableResize}
          handleOffset={handleOffset}
          className="h-full"
        >
          {children}
        </WidthResizable>
      </div>

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

      {onToggle && !open && showInternalExpandButtonWhenClosed && (
        <SidebarToggleButton.Expand
          isHidden
          onToggle={onToggle}
          side={sidebarPosition}
        />
      )}
    </div>
  );
};

export default ResizeableAndHideableSidebar;
