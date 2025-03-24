import React, { memo, useMemo } from "react";
import classnames from "classnames";

import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme";
import useRightSidebarStore from "@/stores/useRightSidebarStore";

import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import RightSidebarContent from "./RightSidebarContent";

import "./registerTabs";
import styles from "./index.module.less";

const RightSidebar: React.FC = memo(() => {
  const { isDark } = useTheme();
  const { open, width } = useRightSidebarStore(
    useShallow((state) => ({
      open: state.open,
      width: state.width,
    })),
  );

  const handleWidthChange = useMemoizedFn((width: number) => {
    useRightSidebarStore.setState({ width });
  });

  const content = useMemo(() => {
    if (!open) {
      return null;
    }
    return <RightSidebarContent />;
  }, [open]);

  return (
    <ResizableAndHideableSidebar
      side="left"
      width={width}
      onWidthChange={handleWidthChange}
      open={open}
      disableResize={!open}
      className={styles.rightSidebar}
      minWidth={300}
      maxWidth={800}
    >
      <div
        className={classnames(styles.contentWrapper, { [styles.dark]: isDark })}
      >
        {content}
      </div>
    </ResizableAndHideableSidebar>
  );
});

// 导出标签类型以供外部使用
export * from "./types";

export default RightSidebar;
