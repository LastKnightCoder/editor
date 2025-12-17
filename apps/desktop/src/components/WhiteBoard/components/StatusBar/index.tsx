import React, { memo, forwardRef } from "react";
import { Flex, Popover, Tooltip } from "antd";
import { Maximize2, Minus, Plus } from "lucide-react";
import For from "@/components/For";
import GridSettings from "./GridSettings";
import PresentationSequenceComponent from "./PresentationSequence";
import { PresentationSequence } from "../../types";
import { ZOOMS } from "../../constants";
import { usePresentationState } from "../../hooks";
import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme";
import classnames from "classnames";

interface StatusBarProps {
  gridVisible?: boolean;
  gridSize?: number;
  zoom: number;
  sequences: PresentationSequence[];
  onGridVisibleChange: (visible: boolean) => void;
  onGridSizeChange: (size: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomTo: (zoomValue: number) => void;
  onFitElements: (e: React.MouseEvent<HTMLDivElement>) => void;
  onStartPresentation: (sequenceId: string) => void;
  onEditSequence: (sequenceId: string) => void;
  onDeleteSequence: (sequenceId: string) => void;
}

const StatusBar = memo(
  forwardRef<HTMLDivElement, StatusBarProps>((props, ref) => {
    const {
      gridVisible = false,
      gridSize = 20,
      zoom,
      sequences,
      onGridVisibleChange,
      onGridSizeChange,
      onZoomIn,
      onZoomOut,
      onZoomTo,
      onFitElements,
      onStartPresentation,
      onEditSequence,
      onDeleteSequence,
    } = props;

    const { isPresentationMode } = usePresentationState();
    const { isDark } = useTheme();
    const stopPropagation = useMemoizedFn((e: any) => {
      e.stopPropagation();
    });

    // 如果处于演示模式，不显示状态栏
    if (isPresentationMode) {
      return null;
    }

    return (
      <Flex
        ref={ref}
        className={classnames(styles.statusBar, {
          [styles.dark]: isDark,
        })}
        align={"center"}
        onPointerDown={stopPropagation}
        onDoubleClick={stopPropagation}
        onClick={stopPropagation}
      >
        <GridSettings
          gridVisible={gridVisible}
          gridSize={gridSize}
          onVisibleChange={onGridVisibleChange}
          onSizeChange={onGridSizeChange}
        />
        <Tooltip title="全览">
          <div
            onClick={onFitElements}
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2em",
              height: "2em",
            }}
          >
            <Maximize2 size={16} />
          </div>
        </Tooltip>
        <Minus size={16} onClick={onZoomIn} style={{ cursor: "pointer" }} />
        <Popover
          trigger={"click"}
          arrow={false}
          content={
            <Flex vertical gap={4} className={styles.zoomPopover}>
              <For
                data={ZOOMS}
                renderItem={(zoomValue) => (
                  <div
                    key={zoomValue}
                    className={styles.zoomItem}
                    onClick={() => onZoomTo(zoomValue)}
                  >
                    {Math.round(zoomValue * 100)}%
                  </div>
                )}
              />
            </Flex>
          }
          styles={{
            content: {
              padding: 4,
              marginBottom: 12,
            },
          }}
        >
          <div className={styles.zoomText}>{Math.round(zoom * 100)}%</div>
        </Popover>
        <Plus size={16} onClick={onZoomOut} style={{ cursor: "pointer" }} />
        <PresentationSequenceComponent
          sequences={sequences}
          onStartPresentation={onStartPresentation}
          onEditSequence={onEditSequence}
          onDeleteSequence={onDeleteSequence}
        />
      </Flex>
    );
  }),
);

export default StatusBar;
