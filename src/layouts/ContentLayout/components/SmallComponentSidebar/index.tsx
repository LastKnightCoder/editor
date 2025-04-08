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
import LatestUpdate from "./components/LatestUpdate";
import UnansweredQuestions from "./components/UnansweredQuestions";

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
        <Flex vertical gap={16} className={styles.list}>
          <Card>
            <ToClearCards />
          </Card>
          <Card>
            <DailyReview />
          </Card>
          <Card>
            <LatestUpdate />
          </Card>
          <Card>
            <UnansweredQuestions />
          </Card>
        </Flex>
      </div>
    </ResizableAndHideableSidebar>
  );
});

export default SmallComponentSidebar;
