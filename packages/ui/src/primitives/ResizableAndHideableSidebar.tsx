import { cn } from "../cn";
import React, { useCallback, useState, useEffect } from "react";
import WidthResizable from "./WidthResizable";
import { SidebarCollapseButton, SidebarExpandButton } from "./SidebarToggleButton";
import useDragAndHideSidebar from "../hooks/useDragAndHideSidebar";

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
  /** 侧边栏的位置（左侧或右侧），用于确定按钮显示位置 */
  sidebarPosition?: "left" | "right";
  disableResize?: boolean;
  handleOffset?: number;
  /**
   * 收起后是否在边缘显示统一的 hover 展开按钮。
   * 适合“收起时完全不可见，只在边缘悬浮展开”的场景。
   */
  showInternalExpandButtonWhenClosed?: boolean;
  /** 透传 WidthResizable：常驻淡分隔线标出拖拽边界 */
  showDivider?: boolean;
  /** 以 flex 铺满父级剩余空间，替代固定宽度（如视频笔记收起对话后材料栏独占） */
  fillRemaining?: boolean;
}

const ResizeableAndHideableSidebar = (props: ResizeableAndHideableSidebarProps) => {
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
    resizeHandleSide = "right",
    sidebarPosition = "left",
    disableResize = false,
    handleOffset,
    showInternalExpandButtonWhenClosed = false,
    showDivider,
    fillRemaining = false,
  } = props;

  const [isHoveringEdge, setIsHoveringEdge] = useState(false);
  const actualWidth = Math.min(Math.max(width, minWidth), maxWidth);

  useEffect(() => {
    setIsHoveringEdge(false);
  }, [open]);

  const handleAnimatedWidthChange = useCallback(
    (_width: number, actualWidth?: number) => {
      onWidthChange?.(width, actualWidth);
    },
    [onWidthChange, width]
  );

  const ref = useDragAndHideSidebar<HTMLDivElement>({
    width: actualWidth,
    open,
    onWidthChange: handleAnimatedWidthChange,
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
      style={{ ...style, ...(fillRemaining ? undefined : { width: actualWidth }) }}
      className={cn("relative", fillRemaining && "min-w-0 flex-1", className)}
    >
      <div className={`h-full w-full ${open ? "" : "overflow-hidden"}`}>
        <WidthResizable
          defaultWidth={actualWidth}
          minWidth={minWidth}
          maxWidth={maxWidth}
          onResize={width => {
            onWidthChange?.(width, width);
          }}
          fillRemaining={fillRemaining}
          style={{
            height: "100%",
          }}
          side={resizeHandleSide}
          disableResize={disableResize}
          handleOffset={handleOffset}
          showDivider={showDivider}
          className="h-full"
        >
          {children}
        </WidthResizable>
      </div>

      {onToggle && open && (
        <div
          className={`absolute ${sidebarPosition === "left" ? "right-0" : "left-0"} top-0 bottom-0 z-5 w-6`}
          onMouseEnter={() => setIsHoveringEdge(true)}
          onMouseLeave={() => setIsHoveringEdge(false)}
        >
          {/* 收起按钮 */}
          <div
            className={`transition-opacity duration-200 ${isHoveringEdge ? "opacity-100" : "opacity-0"}`}
            style={{ pointerEvents: isHoveringEdge ? "auto" : "none" }}
          >
            <SidebarCollapseButton onToggle={onToggle} side={sidebarPosition} />
          </div>
        </div>
      )}

      {onToggle && !open && showInternalExpandButtonWhenClosed && (
        <SidebarExpandButton isHidden onToggle={onToggle} side={sidebarPosition} />
      )}
    </div>
  );
};

export default ResizeableAndHideableSidebar;
