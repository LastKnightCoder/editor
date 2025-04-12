import React, { memo, forwardRef } from "react";
import { Flex, Popover, Tooltip } from "antd";
import {
  FullscreenOutlined,
  MinusOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import For from "@/components/For";
import GridSettings from "./GridSettings";
import PresentationSequenceComponent from "./PresentationSequence";
import { PresentationSequence } from "../../types";
import { ZOOMS } from "../../constants";
import { usePresentationState } from "../../hooks";
import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

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
        className={styles.statusBar}
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
            <FullscreenOutlined />
          </div>
        </Tooltip>
        <MinusOutlined onClick={onZoomIn} />
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
            body: {
              padding: 4,
              marginBottom: 12,
            },
          }}
        >
          <div className={styles.zoomText}>{Math.round(zoom * 100)}%</div>
        </Popover>
        <PlusOutlined onClick={onZoomOut} />
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
