import { memo, useRef, useState } from "react";
import { DndProvider, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import classnames from "classnames";
import useTabStore from "@/stores/useTabStore";
import TitlebarWithTabs from "../TitlebarWithTabs";
import TabContent from "../TabContent";
import { PaneDirection, ITab } from "@/types/tab";
import styles from "./index.module.less";

interface DragItem {
  type: string;
  paneId: string;
  tab: ITab;
  index: number;
}

// 内容区域拖拽分屏组件
const ContentDropZone = memo(
  ({
    paneId,
    children,
    className,
  }: {
    paneId: string;
    children: React.ReactNode;
    className?: string;
  }) => {
    const [dropZone, setDropZone] = useState<
      "left" | "right" | "top" | "bottom" | null
    >(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const createPaneWithTab = useTabStore((state) => state.createPaneWithTab);

    const [, drop] = useDrop<DragItem>({
      accept: "TAB",
      hover: (item, monitor) => {
        if (!containerRef.current || !monitor.isOver({ shallow: true })) {
          setDropZone(null);
          return;
        }

        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;

        const dropElement = containerRef.current.getBoundingClientRect();
        const threshold = 100; // 边缘触发区域大小（像素）

        let zone: "left" | "right" | "top" | "bottom" | null = null;

        // 检测是否在边缘区域（只有当拖拽源和目标是同一个 pane 时才允许边缘分屏）
        if (item.paneId === paneId) {
          if (clientOffset.x - dropElement.left < threshold) {
            zone = "left";
          } else if (dropElement.right - clientOffset.x < threshold) {
            zone = "right";
          } else if (clientOffset.y - dropElement.top < threshold) {
            zone = "top";
          } else if (dropElement.bottom - clientOffset.y < threshold) {
            zone = "bottom";
          }
        }

        setDropZone(zone);
      },
      drop: (item) => {
        const zone = dropZone;
        setDropZone(null);

        if (zone) {
          const direction =
            zone === "left" || zone === "right"
              ? PaneDirection.Horizontal
              : PaneDirection.Vertical;

          console.log("[ContentDropZone] Creating pane with tab:", {
            fromPaneId: item.paneId,
            tabId: item.tab.id,
            tabTitle: item.tab.title,
            direction,
          });

          // 创建新 pane 并移动 tab（原子操作）
          createPaneWithTab(item.paneId, item.tab.id, direction, 0.5);
        }

        return { paneId, dropZone: zone };
      },
    });

    return (
      <div
        ref={containerRef}
        className={classnames("relative w-full h-full", className)}
      >
        <div ref={drop} className="w-full h-full">
          {children}
        </div>
        {dropZone && (
          <div
            className={classnames(
              "absolute bg-green-400/10 border-2 border-dashed border-green-300 pointer-events-none z-50 transition-all",
              {
                "left-0 top-0 w-1/2 h-full": dropZone === "left",
                "right-0 top-0 w-1/2 h-full": dropZone === "right",
                "left-0 top-0 w-full h-1/2": dropZone === "top",
                "left-0 bottom-0 w-full h-1/2": dropZone === "bottom",
              },
            )}
          />
        )}
      </div>
    );
  },
);

const PanesLayout = memo(() => {
  const panes = useTabStore((state) => state.panes);

  if (panes.length === 0) {
    return <div>没有打开的窗格</div>;
  }

  if (panes.length === 1) {
    const pane = panes[0];
    const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);

    return (
      <DndProvider backend={HTML5Backend}>
        <div className={styles.singlePane}>
          <TitlebarWithTabs paneId={pane.id} />
          <ContentDropZone
            paneId={pane.id}
            className={"flex-1 min-h-0 overflow-hidden"}
          >
            <div className={classnames(styles.paneContent)}>
              {activeTab && <TabContent tab={activeTab} paneId={pane.id} />}
            </div>
          </ContentDropZone>
        </div>
      </DndProvider>
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

  if (isHorizontal) {
    return (
      <DndProvider backend={HTML5Backend}>
        <div className={styles.panesContainer}>
          <div
            className={styles.pane}
            style={{ width: `${splitRatio * 100}%`, height: "100%" }}
          >
            <TitlebarWithTabs paneId={firstPane.id} />
            <ContentDropZone paneId={firstPane.id}>
              <div className={styles.paneContent}>
                {firstActiveTab && (
                  <TabContent tab={firstActiveTab} paneId={firstPane.id} />
                )}
              </div>
            </ContentDropZone>
          </div>

          <div
            className={styles.pane}
            style={{ width: `${(1 - splitRatio) * 100}%`, height: "100%" }}
          >
            <TitlebarWithTabs paneId={secondPane.id} />
            <ContentDropZone paneId={secondPane.id}>
              <div className={styles.paneContent}>
                {secondActiveTab && (
                  <TabContent tab={secondActiveTab} paneId={secondPane.id} />
                )}
              </div>
            </ContentDropZone>
          </div>
        </div>
      </DndProvider>
    );
  } else {
    return (
      <DndProvider backend={HTML5Backend}>
        <div
          className={styles.panesContainer}
          style={{ flexDirection: "column" }}
        >
          <div
            className={styles.pane}
            style={{ width: "100%", height: `${splitRatio * 100}%` }}
          >
            <TitlebarWithTabs paneId={firstPane.id} />
            <ContentDropZone paneId={firstPane.id}>
              <div className={styles.paneContent}>
                {firstActiveTab && (
                  <TabContent tab={firstActiveTab} paneId={firstPane.id} />
                )}
              </div>
            </ContentDropZone>
          </div>

          <div
            className={styles.pane}
            style={{ width: "100%", height: `${(1 - splitRatio) * 100}%` }}
          >
            <TitlebarWithTabs paneId={secondPane.id} />
            <ContentDropZone paneId={secondPane.id}>
              <div className={styles.paneContent}>
                {secondActiveTab && (
                  <TabContent tab={secondActiveTab} paneId={secondPane.id} />
                )}
              </div>
            </ContentDropZone>
          </div>
        </div>
      </DndProvider>
    );
  }
});

export default PanesLayout;
