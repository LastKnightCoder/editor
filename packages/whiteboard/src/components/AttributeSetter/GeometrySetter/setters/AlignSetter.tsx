import React from "react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";

import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { GeometryUtil } from "../../../../utils";
import { AttrPopover, Seg } from "../../../../chrome";

type Align = "left" | "center" | "right";
const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const;

// 文本对齐设置器组件
const AlignSetterComponent: React.FC<GeometrySetterComponentProps> = ({ element, onChange }) => {
  const handleSelect = useMemoizedFn((value: Align) => {
    const newElement = produce(element, draft => {
      if (draft.text) draft.text.align = value;
    });
    GeometryUtil.setLocalStorage("textAlign", value);
    onChange(newElement);
  });

  // 如果元素没有文本属性，不显示对齐设置
  if (!element.text) return null;
  const current = (element.text.align as Align) || "center";
  const Icon = ALIGN_ICON[current] ?? AlignCenter;

  return (
    <AttrPopover label="文字对齐" icon={<Icon strokeWidth={1.75} />} width={220}>
      <Seg<Align>
        label="文字对齐"
        value={current}
        onChange={handleSelect}
        options={[
          { value: "left", label: "左对齐" },
          { value: "center", label: "居中" },
          { value: "right", label: "右对齐" },
        ]}
      />
    </AttrPopover>
  );
};

// 文本对齐设置器实现
export class AlignSetter extends BaseGeometrySetter {
  constructor() {
    // 只有包含文本的几何图形才需要对齐设置
    super("align-setter", "文本对齐设置器", ["*"], 80);
  }

  getIcon(): React.ReactNode {
    return <AlignCenter size={16} />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return AlignSetterComponent;
  }
}
