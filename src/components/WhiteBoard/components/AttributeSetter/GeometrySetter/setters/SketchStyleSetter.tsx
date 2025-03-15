import React from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { Popover, Tooltip, Switch, Slider } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import styles from "./setters.module.less";
import { PiPencilLineDuotone } from "react-icons/pi";

// 草图风格设置器组件
const SketchStyleSetterComponent: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  // 从通用属性中获取草图风格设置，如果不存在则默认为关闭状态
  const sketchEnabled = element.sketchEnabled || false;
  const roughness = element.roughness || 1;

  const handleSketchEnabledChange = useMemoizedFn((checked: boolean) => {
    const newElement = produce(element, (draft) => {
      draft.sketchEnabled = checked;
    });
    onChange(newElement);
  });

  const handleRoughnessChange = useMemoizedFn((value: number) => {
    const newElement = produce(element, (draft) => {
      draft.roughness = value;
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
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span>草图风格</span>
            <Switch
              checked={sketchEnabled}
              onChange={handleSketchEnabledChange}
              size="small"
            />
          </div>
          {sketchEnabled && (
            <div>
              <span>粗糙度</span>
              <Slider
                min={0.1}
                max={3}
                step={0.1}
                value={roughness}
                onChange={handleRoughnessChange}
                tooltip={{ formatter: (value) => `${value}` }}
              />
            </div>
          )}
        </div>
      }
    >
      <Tooltip title="草图风格" placement="left">
        <div className={styles.item}>
          <PiPencilLineDuotone />
        </div>
      </Tooltip>
    </Popover>
  );
};

// 草图风格设置器实现
export class SketchStyleSetter extends BaseGeometrySetter {
  constructor() {
    // 适用于所有几何图形
    super("sketch-style-setter", "草图风格设置器", ["*"], 60);
  }

  getIcon(): React.ReactNode {
    return <PiPencilLineDuotone />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return SketchStyleSetterComponent;
  }
}
