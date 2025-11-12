import { memo } from "react";
import { Resizable } from "react-resizable";
import useTabStore from "@/stores/useTabStore";
import TitlebarWithTabs from "../TitlebarWithTabs";
import TabContent from "../TabContent";
import { PaneDirection } from "@/types/tab";
import styles from "./index.module.less";
import "react-resizable/css/styles.css";

const PanesLayout = memo(() => {
  const panes = useTabStore((state) => state.panes);
  const updatePaneSplitRatio = useTabStore(
    (state) => state.updatePaneSplitRatio,
  );

  if (panes.length === 0) {
    return <div>没有打开的窗格</div>;
  }

  if (panes.length === 1) {
    const pane = panes[0];
    const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);

    return (
      <div className={styles.singlePane}>
        <TitlebarWithTabs paneId={pane.id} />
        <div className={styles.paneContent}>
          {activeTab && <TabContent tab={activeTab} paneId={pane.id} />}
        </div>
      </div>
    );
  }

  // 多个 pane 的布局（简化版本，暂时只支持两个 pane）
  const firstPane = panes[0];
  const secondPane = panes[1];
  const direction = secondPane.direction || PaneDirection.Horizontal;
  const splitRatio = secondPane.splitRatio || 0.5;

  const firstActiveTab = firstPane.tabs.find(
    (t) => t.id === firstPane.activeTabId,
  );
  const secondActiveTab = secondPane.tabs.find(
    (t) => t.id === secondPane.activeTabId,
  );

  const isHorizontal = direction === PaneDirection.Horizontal;

  const handleResize = (
    _: any,
    data: { size: { width: number; height: number } },
  ) => {
    if (isHorizontal) {
      const containerWidth =
        document.querySelector(`.${styles.panesContainer}`)?.clientWidth ||
        1000;
      const newRatio = data.size.width / containerWidth;
      updatePaneSplitRatio(secondPane.id, newRatio);
    } else {
      const containerHeight =
        document.querySelector(`.${styles.panesContainer}`)?.clientHeight ||
        800;
      const newRatio = data.size.height / containerHeight;
      updatePaneSplitRatio(secondPane.id, newRatio);
    }
  };

  if (isHorizontal) {
    return (
      <div className={styles.panesContainer}>
        <Resizable
          width={splitRatio * 1000}
          height={0}
          onResize={handleResize}
          axis="x"
          resizeHandles={["e"]}
        >
          <div
            className={styles.pane}
            style={{ width: `${splitRatio * 100}%`, height: "100%" }}
          >
            <TitlebarWithTabs paneId={firstPane.id} />
            <div className={styles.paneContent}>
              {firstActiveTab && (
                <TabContent tab={firstActiveTab} paneId={firstPane.id} />
              )}
            </div>
          </div>
        </Resizable>

        <div
          className={styles.pane}
          style={{ width: `${(1 - splitRatio) * 100}%`, height: "100%" }}
        >
          <TitlebarWithTabs paneId={secondPane.id} />
          <div className={styles.paneContent}>
            {secondActiveTab && (
              <TabContent tab={secondActiveTab} paneId={secondPane.id} />
            )}
          </div>
        </div>
      </div>
    );
  } else {
    return (
      <div
        className={styles.panesContainer}
        style={{ flexDirection: "column" }}
      >
        <Resizable
          width={0}
          height={splitRatio * 800}
          onResize={handleResize}
          axis="y"
          resizeHandles={["s"]}
        >
          <div
            className={styles.pane}
            style={{ width: "100%", height: `${splitRatio * 100}%` }}
          >
            <TitlebarWithTabs paneId={firstPane.id} />
            <div className={styles.paneContent}>
              {firstActiveTab && (
                <TabContent tab={firstActiveTab} paneId={firstPane.id} />
              )}
            </div>
          </div>
        </Resizable>

        <div
          className={styles.pane}
          style={{ width: "100%", height: `${(1 - splitRatio) * 100}%` }}
        >
          <TitlebarWithTabs paneId={secondPane.id} />
          <div className={styles.paneContent}>
            {secondActiveTab && (
              <TabContent tab={secondActiveTab} paneId={secondPane.id} />
            )}
          </div>
        </div>
      </div>
    );
  }
});

export default PanesLayout;
