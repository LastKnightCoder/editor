import React from "react";
import { Flex, Switch, Select, Popover, Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import { BorderOutlined } from "@ant-design/icons";
import { GRID_SIZE_OPTIONS } from "../../../constants";
import styles from "./index.module.less";

interface GridSettingsProps {
  gridVisible?: boolean;
  gridSize?: number;
  onVisibleChange?: (visible: boolean) => void;
  onSizeChange?: (size: number) => void;
}

const GridSettings: React.FC<GridSettingsProps> = ({
  gridVisible,
  gridSize,
  onVisibleChange,
  onSizeChange,
}) => {
  const handleVisibleChange = useMemoizedFn((checked: boolean) => {
    onVisibleChange?.(checked);
  });

  const handleSizeChange = useMemoizedFn((value: number) => {
    onSizeChange?.(value);
  });

  const stopPropagation = useMemoizedFn((e: any) => {
    e.stopPropagation();
  });

  const content = (
    <Flex
      vertical
      gap={8}
      className={styles.gridSettingsContent}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onDoubleClick={stopPropagation}
    >
      <Flex align="center" justify="space-between">
        <span>显示网格</span>
        <Switch checked={gridVisible} onChange={handleVisibleChange} />
      </Flex>
      <Flex align="center" justify="space-between">
        <span>网格大小</span>
        <Select
          value={gridSize}
          onChange={handleSizeChange}
          options={GRID_SIZE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.lable,
          }))}
          style={{ width: 80 }}
          disabled={!gridVisible}
        />
      </Flex>
    </Flex>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="top"
      arrow={false}
      styles={{
        body: {
          padding: 12,
        },
      }}
    >
      <Tooltip title="网格设置">
        <div
          className={styles.gridSettingsButton}
          onClick={stopPropagation}
          onPointerDown={stopPropagation}
          onDoubleClick={stopPropagation}
        >
          <BorderOutlined />
        </div>
      </Tooltip>
    </Popover>
  );
};

export default GridSettings;
