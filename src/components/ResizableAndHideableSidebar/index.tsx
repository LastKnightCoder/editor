import React from 'react';
import WidthResizable from "@/components/WidthResizable";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import useDragAndHideSidebar from "@/hooks/useDragAndHideSidebar.ts";

interface ResizeableAndHideableSidebarProps {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  minWidth?: number;
  maxWidth?: number;
}

const ResizeableAndHideableSidebar = (props: ResizeableAndHideableSidebarProps) => {
  const {
    className,
    style,
    children,
    minWidth = 200,
    maxWidth = 500,
  } = props;

  const scope = useDragAndHideSidebar();

  const {
    sidebarWidth,
  } = useGlobalStateStore(state => ({
    sidebarWidth: state.sidebarWidth,
  }));

  return (
    <div ref={scope} style={{ ...style, width: sidebarWidth }} className={className}>
      <WidthResizable
        defaultWidth={sidebarWidth}
        minWidth={minWidth}
        maxWidth={maxWidth}
        onResize={(width) => {
          useGlobalStateStore.setState({
            sidebarWidth: width,
          });
          localStorage.setItem('sidebarWidth', String(width));
        }}
        style={{
          height: '100%'
        }}
      >
        {children}
      </WidthResizable>
    </div>
  )
}

export default ResizeableAndHideableSidebar;