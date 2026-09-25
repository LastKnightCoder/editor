import React from "react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";

import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { GeometryUtil } from "@/components/WhiteBoard/utils";
import { AttrPopover, Slider } from "@/components/WhiteBoard/chrome";
import { LineWidthIcon } from "@/components/WhiteBoard/chrome/icons";

// 线条粗细设置器组件
const StrokeWidthSetterComponent: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  const strokeWidth = element.strokeWidth || 1;
  const handleChange = useMemoizedFn((value: number) => {
    const newElement = produce(element, draft => {
      draft.strokeWidth = value;
    });
    GeometryUtil.setLocalStorage("strokeWidth", String(value));
    onChange(newElement);
  });
  return (
    <AttrPopover label="边框粗细" icon={<LineWidthIcon />}>
      <Slider
        label="边框粗细"
        min={1}
        max={20}
        value={strokeWidth}
        unit="px"
        onChange={handleChange}
      />
    </AttrPopover>
  );
};

// 线条粗细设置器实现
export class StrokeWidthSetter extends BaseGeometrySetter {
  constructor() {
    // 所有几何图形都可以设置线条粗细
    super("stroke-width-setter", "线条粗细设置器", ["*"], 90);
  }

  getIcon(): React.ReactNode {
    return <LineWidthIcon />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return StrokeWidthSetterComponent;
  }
}
