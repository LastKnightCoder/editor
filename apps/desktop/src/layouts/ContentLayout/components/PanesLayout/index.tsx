import { memo, useRef, useState, useCallback } from "react";
import { DndProvider, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import classnames from "classnames";
import useTabStore from "@/stores/useTabStore";
import TitlebarWithTabs from "../TitlebarWithTabs";
import TabContent from "../TabContent";
import { PaneDirection, ITab } from "@/types/tab";
import styles from "./index.module.less";

type TabDragItem = {
  type: "TAB";
  paneId: string;
  tab: ITab;
  index: number;
};

type TabGroupDragItem = {
  type: "TAB_GROUP";
  groupId: string;
  paneId: string;
};

type DragItem = TabDragItem | TabGroupDragItem;

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
    const createPaneWithTabGroup = useTabStore(
      (state) => state.createPaneWithTabGroup,
    );

    const [, drop] = useDrop<DragItem>({
      accept: ["TAB", "TAB_GROUP"],
      hover: (_item, monitor) => {
        if (!containerRef.current || !monitor.isOver({ shallow: true })) {
          setDropZone(null);
          return;
        }

        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;

        const dropElement = containerRef.current.getBoundingClientRect();
        const threshold = 100; // 边缘触发区域大小（像素）

        let zone: "left" | "right" | "top" | "bottom" | null = null;

        // 检测是否在边缘区域
        if (clientOffset.x - dropElement.left < threshold) {
          zone = "left";
        } else if (dropElement.right - clientOffset.x < threshold) {
          zone = "right";
        } else if (clientOffset.y - dropElement.top < threshold) {
          zone = "top";
        } else if (dropElement.bottom - clientOffset.y < threshold) {
          zone = "bottom";
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

          if (item.type === "TAB") {
            // 创建新 pane 并移动 tab（原子操作）
            createPaneWithTab(item.paneId, item.tab.id, direction, 0.5);
          } else if (item.type === "TAB_GROUP") {
            // 创建新 pane 并移动整个分组（原子操作）
            createPaneWithTabGroup(item.paneId, item.groupId, direction, 0.5);
          }
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

// 可拖拽的分割线组件
const Resizer = memo(
  ({
    direction,
    paneId,
    containerRef,
  }: {
    direction: PaneDirection;
    paneId: string;
    containerRef: React.RefObject<HTMLDivElement>;
  }) => {
    const [isDragging, setIsDragging] = useState(false);
    const updatePaneSplitRatio = useTabStore(
      (state) => state.updatePaneSplitRatio,
    );

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
          if (!containerRef.current) return;

          const container = containerRef.current.getBoundingClientRect();

          if (direction === PaneDirection.Horizontal) {
            // 水平分割（左右）
            const mouseX = moveEvent.clientX;
            const containerLeft = container.left;
            const containerWidth = container.width;

            // 计算鼠标在容器中的相对位置
            const relativeX = mouseX - containerLeft;
            let newRatio = relativeX / containerWidth;

            // 限制比例范围 0.2 ~ 0.8
            newRatio = Math.max(0.2, Math.min(0.8, newRatio));

            updatePaneSplitRatio(paneId, newRatio);
          } else {
            // 垂直分割（上下）
            const mouseY = moveEvent.clientY;
            const containerTop = container.top;
            const containerHeight = container.height;

            // 计算鼠标在容器中的相对位置
            const relativeY = mouseY - containerTop;
            let newRatio = relativeY / containerHeight;

            // 限制比例范围 0.2 ~ 0.8
            newRatio = Math.max(0.2, Math.min(0.8, newRatio));

            updatePaneSplitRatio(paneId, newRatio);
          }
        };

        const handleMouseUp = () => {
          setIsDragging(false);
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
      },
      [direction, paneId, containerRef, updatePaneSplitRatio],
    );

    const isHorizontal = direction === PaneDirection.Horizontal;

    return (
      <div
        className={classnames(
          "bg-gray-300 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-600 transition-colors z-10",
          {
            "w-1 cursor-col-resize": isHorizontal,
            "h-1 cursor-row-resize": !isHorizontal,
            "bg-blue-500 dark:bg-blue-500": isDragging,
          },
        )}
        onMouseDown={handleMouseDown}
      />
    );
  },
);

const PanesLayout = memo(() => {
  const panes = useTabStore((state) => state.panes);
  const containerRef = useRef<HTMLDivElement>(null);

  if (panes.length === 0) {
    return <div>没有打开的窗格</div>;
  }

  if (panes.length === 1) {
    const pane = panes[0];
    const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);

    return (
      <div className={styles.singlePane}>
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            <TitlebarWithTabs paneId={pane.id} showRightControls={true} />
            <ContentDropZone
              paneId={pane.id}
              className={"flex-1 min-h-0 overflow-hidden"}
            >
              <div className={classnames(styles.paneContent)}>
                {activeTab && <TabContent tab={activeTab} paneId={pane.id} />}
              </div>
            </ContentDropZone>
          </div>
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

  if (isHorizontal) {
    // 左右布局：只在右侧的 pane 显示控件
    return (
      <DndProvider backend={HTML5Backend}>
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div
            ref={containerRef}
            className={classnames(styles.panesContainer, "flex-1 min-w-0")}
          >
            <div
              className={styles.pane}
              style={{ width: `${splitRatio * 100}%`, height: "100%" }}
            >
              <TitlebarWithTabs
                paneId={firstPane.id}
                showRightControls={false}
              />
              <ContentDropZone
                paneId={firstPane.id}
                className="flex-1 min-h-0 overflow-hidden"
              >
                <div className={styles.paneContent}>
                  {firstActiveTab && (
                    <TabContent tab={firstActiveTab} paneId={firstPane.id} />
                  )}
                </div>
              </ContentDropZone>
            </div>

            <Resizer
              direction={direction}
              paneId={secondPane.id}
              containerRef={containerRef}
            />

            <div
              className={styles.pane}
              style={{ width: `${(1 - splitRatio) * 100}%`, height: "100%" }}
            >
              <TitlebarWithTabs
                paneId={secondPane.id}
                showRightControls={true}
              />
              <ContentDropZone
                paneId={secondPane.id}
                className="flex-1 min-h-0 overflow-hidden"
              >
                <div className={styles.paneContent}>
                  {secondActiveTab && (
                    <TabContent tab={secondActiveTab} paneId={secondPane.id} />
                  )}
                </div>
              </ContentDropZone>
            </div>
          </div>
        </div>
      </DndProvider>
    );
  } else {
    // 上下布局：只在上面的 pane 显示控件
    return (
      <DndProvider backend={HTML5Backend}>
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div
            ref={containerRef}
            className={classnames(styles.panesContainer, "flex-1 min-w-0")}
            style={{ flexDirection: "column" }}
          >
            <div
              className={styles.pane}
              style={{ width: "100%", height: `${splitRatio * 100}%` }}
            >
              <TitlebarWithTabs
                paneId={firstPane.id}
                showRightControls={true}
              />
              <ContentDropZone
                paneId={firstPane.id}
                className="flex-1 min-h-0 overflow-hidden"
              >
                <div className={styles.paneContent}>
                  {firstActiveTab && (
                    <TabContent tab={firstActiveTab} paneId={firstPane.id} />
                  )}
                </div>
              </ContentDropZone>
            </div>

            <Resizer
              direction={direction}
              paneId={secondPane.id}
              containerRef={containerRef}
            />

            <div
              className={styles.pane}
              style={{ width: "100%", height: `${(1 - splitRatio) * 100}%` }}
            >
              <TitlebarWithTabs
                paneId={secondPane.id}
                showRightControls={false}
              />
              <ContentDropZone
                paneId={secondPane.id}
                className="flex-1 min-h-0 overflow-hidden"
              >
                <div className={styles.paneContent}>
                  {secondActiveTab && (
                    <TabContent tab={secondActiveTab} paneId={secondPane.id} />
                  )}
                </div>
              </ContentDropZone>
            </div>
          </div>
        </div>
      </DndProvider>
    );
  }
});

export default PanesLayout;
