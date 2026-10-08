import React from "react";
import { produce } from "immer";
import { PenLine } from "lucide-react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { GeometryUtil } from "../../../../utils";
import SketchPopover from "../../SketchPopover";

const SketchSetterComponent: React.FC<GeometrySetterComponentProps> = ({ element, onChange }) => (
  <SketchPopover
    target={element}
    onChange={onChange}
    fill={{
      color: element.fill,
      style: element.fillStyle,
      onChange: style => {
        GeometryUtil.setLocalStorage("fillStyle", style);
        onChange(
          produce(element, draft => {
            draft.fillStyle = style;
          })
        );
      },
    }}
  />
);

/** 笔触设置器（D-107）：适用于所有几何图形 */
export class SketchSetter extends BaseGeometrySetter {
  constructor() {
    super("sketch-setter", "笔触设置器", ["*"], 60);
  }

  getIcon(): React.ReactNode {
    return <PenLine strokeWidth={1.75} />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return SketchSetterComponent;
  }
}
