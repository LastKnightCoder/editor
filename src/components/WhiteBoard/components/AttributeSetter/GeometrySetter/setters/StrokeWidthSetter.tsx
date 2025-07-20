import React from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { BsBorderWidth } from "react-icons/bs";
import { Popover, Tooltip, Slider, ConfigProvider, theme } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import styles from "./setters.module.less";

// 线条粗细设置器组件
const StrokeWidthSetterComponent: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  // 获取当前线条粗细，默认为 1
  const strokeWidth = element.strokeWidth || 1;

  const handleStrokeWidthChange = useMemoizedFn((value: number) => {
    const newElement = produce(element, (draft) => {
      draft.strokeWidth = value;
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
          backgroundColor: "white",
        },
      }}
      content={
        <div className="text-black">
          <ConfigProvider
            theme={{
              algorithm: theme.defaultAlgorithm,
            }}
          >
            <Slider
              min={1}
              max={20}
              step={1}
              value={strokeWidth}
              onChange={handleStrokeWidthChange}
              tooltip={{ formatter: (value) => `${value}px` }}
            />
          </ConfigProvider>
        </div>
      }
    >
      <Tooltip title={"边框粗细"} placement={"left"}>
        <div className={styles.item}>
          <BsBorderWidth />
        </div>
      </Tooltip>
    </Popover>
  );
};

// 线条粗细设置器实现
export class StrokeWidthSetter extends BaseGeometrySetter {
  constructor() {
    // 所有几何图形都可以设置线条粗细
    super("stroke-width-setter", "线条粗细设置器", ["*"], 90);
  }

  getIcon(): React.ReactNode {
    return <BsBorderWidth />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return StrokeWidthSetterComponent;
  }
}
