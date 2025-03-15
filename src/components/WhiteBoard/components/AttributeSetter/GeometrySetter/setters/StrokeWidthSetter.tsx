import React from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { BsBorderWidth } from "react-icons/bs";
import { Popover, Tooltip } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import styles from "./setters.module.less";

const strokeWidthOptions = [
  { label: "1px", value: 1 },
  { label: "2px", value: 2 },
  { label: "3px", value: 3 },
  { label: "4px", value: 4 },
  { label: "5px", value: 5 },
  { label: "6px", value: 6 },
  { label: "7px", value: 7 },
  { label: "8px", value: 8 },
  { label: "9px", value: 9 },
];

// 线条粗细设置器组件
const StrokeWidthSetterComponent: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  const handleOnSelectStrokeWidth = useMemoizedFn((value: number) => {
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
          marginLeft: 12,
        },
      }}
      content={
        <div className={styles.selectContainer}>
          {strokeWidthOptions.map((strokeOption) => (
            <div
              key={strokeOption.label}
              className={classnames(styles.item, {
                [styles.active]: strokeOption.value === element.strokeWidth,
              })}
              onClick={() => {
                handleOnSelectStrokeWidth(strokeOption.value);
              }}
            >
              <Tooltip title={strokeOption.label}>
                <svg width={24} height={24} viewBox={"0 0 24 24"}>
                  <line
                    x1={2}
                    y1={24 - 2}
                    x2={24 - 2}
                    y2={2}
                    stroke={
                      element.stroke === "transparent"
                        ? "currentColor"
                        : element.stroke
                    }
                    strokeWidth={strokeOption.value}
                  />
                </svg>
              </Tooltip>
            </div>
          ))}
        </div>
      }
    >
      <Tooltip title={"粗细"} placement={"left"}>
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
