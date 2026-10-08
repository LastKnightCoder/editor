import React from "react";
import { CornerIcon } from "../../../../chrome/icons";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";

import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { GeometryUtil } from "../../../../utils";
import { AttrPopover, Slider } from "../../../../chrome";

// 矩形圆角设置器组件
const RectangleCornerRadiusSetterComponent: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  const cornerRadius = element.extraInfo?.cornerRadius || 0;
  const handleChange = useMemoizedFn((value: number) => {
    const newElement = produce(element, draft => {
      if (!draft.extraInfo) draft.extraInfo = {};
      draft.extraInfo.cornerRadius = value;
    });
    GeometryUtil.setLocalStorage("cornerRadius", String(value));
    onChange(newElement);
  });
  return (
    <AttrPopover label="圆角" icon={<CornerIcon />}>
      <Slider
        label="圆角"
        min={0}
        max={50}
        value={cornerRadius}
        unit="px"
        onChange={handleChange}
      />
    </AttrPopover>
  );
};

// 矩形圆角设置器实现
export class RectangleCornerRadiusSetter extends BaseGeometrySetter {
  constructor() {
    // 只适用于矩形
    super("rectangle-corner-radius-setter", "矩形圆角设置器", ["rectangle"], 70);
  }

  getIcon(): React.ReactNode {
    return <CornerIcon />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return RectangleCornerRadiusSetterComponent;
  }
}
