import React, { memo, forwardRef } from "react";
import { Flex, Popover, Tooltip } from "antd";
import {
  FullscreenOutlined,
  PlayCircleOutlined,
  MinusOutlined,
  PlusOutlined,
  EditOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import For from "@/components/For";
import GridSettings from "../GridSettings";
import { PresentationSequence } from "../../plugins";
import { ZOOMS } from "../../constants";
import styles from "./index.module.less";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";

interface StatusBarProps {
  gridVisible?: boolean;
  gridSize?: number;
  zoom: number;
  isPresentationMode: boolean;
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
      isPresentationMode,
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

    const { modal } = App.useApp();

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
            <Flex vertical gap={4}>
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
          {Math.round(zoom * 100)}%
        </Popover>
        <PlusOutlined onClick={onZoomOut} />
        {sequences.length > 0 && (
          <Popover
            trigger={"click"}
            arrow={false}
            onOpenChange={(open) => {
              if (!open) {
                // 关闭弹窗
                document.body.click();
              }
            }}
            content={
              <Flex vertical gap={4}>
                <For
                  data={sequences}
                  renderItem={(sequence) => (
                    <div
                      key={sequence.id}
                      className={styles.zoomItem}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        onClick={() => onStartPresentation(sequence.id)}
                        style={{ flex: 1, cursor: "pointer" }}
                      >
                        {sequence.name}
                      </span>
                      <Flex gap={12}>
                        <EditOutlined
                          style={{ color: "#000" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSequence(sequence.id);
                          }}
                        />
                        <CloseOutlined
                          style={{ color: "#000" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // 删除序列
                            modal.confirm({
                              title: "删除序列",
                              content: "确定删除该序列吗？",
                              onOk: () => {
                                onDeleteSequence(sequence.id);
                              },
                              okButtonProps: {
                                danger: true,
                              },
                            });
                          }}
                        />
                      </Flex>
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
            <Tooltip title="开始演示">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                }}
              >
                <PlayCircleOutlined />
              </div>
            </Tooltip>
          </Popover>
        )}
      </Flex>
    );
  }),
);

export default StatusBar;
