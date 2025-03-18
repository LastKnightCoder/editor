import React from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { PiPencilLineDuotone } from "react-icons/pi";

import SketchStyleSetterComponent from "./SketchStyleSetterComponent";

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
