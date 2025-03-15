import React from "react";
import { Popover, Tooltip, Slider } from "antd";
import { RiRoundedCorner } from "react-icons/ri";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import styles from "./index.module.less";
import { GeometrySetterComponentProps } from "../GeometrySetterRegistry";

const RectangleCornerRadiusSetter: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  // 从 extraInfo 中获取圆角值，如果不存在则默认为 0
  const cornerRadius = element.extraInfo?.cornerRadius || 0;

  const handleCornerRadiusChange = useMemoizedFn((value: number) => {
    const newElement = produce(element, (draft) => {
      if (!draft.extraInfo) {
        draft.extraInfo = {};
      }
      draft.extraInfo.cornerRadius = value;
    });
    onChange(newElement);
  });

  return (
    <Popover
      arrow={false}
      trigger="click"
      placement="right"
      styles={{
        body: {
          padding: 12,
          marginLeft: 12,
          width: 200,
        },
      }}
      content={
        <div className={styles.sliderContainer}>
          <Slider
            min={0}
            max={50}
            value={cornerRadius}
            onChange={handleCornerRadiusChange}
            tooltip={{ formatter: (value) => `${value}px` }}
          />
        </div>
      }
    >
      <Tooltip title="圆角" placement="left">
        <div className={styles.item}>
          <RiRoundedCorner />
        </div>
      </Tooltip>
    </Popover>
  );
};

export default RectangleCornerRadiusSetter;
