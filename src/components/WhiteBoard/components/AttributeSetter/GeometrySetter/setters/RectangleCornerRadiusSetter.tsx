import React from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { Popover, Tooltip, Slider, ConfigProvider, theme } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import styles from "./setters.module.less";
import { RiRoundedCorner } from "react-icons/ri";

// 矩形圆角设置器组件
const RectangleCornerRadiusSetterComponent: React.FC<
  GeometrySetterComponentProps
> = ({ element, onChange }) => {
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
      trigger={"click"}
      placement={"right"}
      styles={{
        body: {
          padding: 12,
          marginLeft: 24,
          width: 200,
        },
      }}
      content={
        <div>
          <ConfigProvider
            theme={{
              algorithm: theme.defaultAlgorithm,
            }}
          >
            <Slider
              min={0}
              max={50}
              step={1}
              value={cornerRadius}
              onChange={handleCornerRadiusChange}
              tooltip={{ formatter: (value) => `${value}px` }}
            />
          </ConfigProvider>
        </div>
      }
    >
      <Tooltip title={"圆角"} placement={"left"}>
        <div className={styles.item}>
          <RiRoundedCorner />
        </div>
      </Tooltip>
    </Popover>
  );
};

// 矩形圆角设置器实现
export class RectangleCornerRadiusSetter extends BaseGeometrySetter {
  constructor() {
    // 只适用于矩形
    super(
      "rectangle-corner-radius-setter",
      "矩形圆角设置器",
      ["rectangle"],
      70,
    );
  }

  getIcon(): React.ReactNode {
    return <RiRoundedCorner />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return RectangleCornerRadiusSetterComponent;
  }
}
