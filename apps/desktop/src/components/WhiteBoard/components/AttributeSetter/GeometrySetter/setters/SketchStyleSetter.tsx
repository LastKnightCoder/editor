import React from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { ScribbleIcon } from "@/components/WhiteBoard/chrome/icons";

import SketchStyleSetterComponent from "./SketchStyleSetterComponent";

// 草图风格设置器实现
export class SketchStyleSetter extends BaseGeometrySetter {
  constructor() {
    // 适用于所有几何图形
    super("sketch-style-setter", "草图风格设置器", ["*"], 60);
  }

  getIcon(): React.ReactNode {
    return <ScribbleIcon />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return SketchStyleSetterComponent;
  }
}
