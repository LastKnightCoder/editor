import { memo } from "react";
import { Card, Flex } from "antd";

import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";

import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";

import styles from "./index.module.less";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSmallComponentSidebarStore from "@/stores/useSmallComponentSidebar";
import DailyReview from "./components/DailyReview";
import ToClearCards from "./components/ToClearCards";

const SmallComponentSidebar = memo(() => {
  const { open, width } = useSmallComponentSidebarStore(
    useShallow((state) => ({
      open: state.open,
      width: state.width,
    })),
  );
  const isConnected = useDatabaseConnected();

  const handleWidthChange = useMemoizedFn((width: number) => {
    useSmallComponentSidebarStore.setState({ width });
  });

  if (!isConnected) {
    return null;
  }

  return (
    <ResizableAndHideableSidebar
      side="left"
      width={width}
      onWidthChange={handleWidthChange}
      open={open}
      disableResize={!open}
      className={styles.container}
      minWidth={300}
      maxWidth={800}
    >
      <div className={styles.content}>
        <Flex vertical gap={16}>
          <Card>
            <ToClearCards />
          </Card>
          <Card>
            <DailyReview />
          </Card>
        </Flex>
      </div>
    </ResizableAndHideableSidebar>
  );
});

export default SmallComponentSidebar;
