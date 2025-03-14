import React, { useState } from "react";
import { Flex, Switch, Select, Popover } from "antd";
import { BorderOutlined } from "@ant-design/icons";
import {
  GRID_SIZE_OPTIONS,
  DEFAULT_GRID_VISIBLE,
  DEFAULT_GRID_SIZE,
} from "../../constants";
import styles from "./index.module.less";

interface GridSettingsProps {
  onVisibleChange?: (visible: boolean) => void;
  onSizeChange?: (size: number) => void;
}

const GridSettings: React.FC<GridSettingsProps> = ({
  onVisibleChange,
  onSizeChange,
}) => {
  const [gridVisible, setGridVisible] = useState<boolean>(DEFAULT_GRID_VISIBLE);
  const [gridSize, setGridSize] = useState<number>(DEFAULT_GRID_SIZE);

  const handleVisibleChange = (checked: boolean) => {
    setGridVisible(checked);
    onVisibleChange?.(checked);
  };

  const handleSizeChange = (value: number) => {
    setGridSize(value);
    onSizeChange?.(value);
  };

  const content = (
    <Flex vertical gap={8} className={styles.gridSettingsContent}>
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
      <div className={styles.gridSettingsButton}>
        <BorderOutlined />
      </div>
    </Popover>
  );
};

export default GridSettings;
