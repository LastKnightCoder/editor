import React from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { BiSolidColorFill } from "react-icons/bi";
import { Popover, Tooltip } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";

import Colors from "./components/Colors";

import styles from "./setters.module.less";

export interface ColorOption {
  fill: string;
  stroke: string;
  color: string;
}

const fillWithStrokeColors: ColorOption[] = [
  // 红色
  {
    fill: "#FFD0CE",
    stroke: "#FF6A63",
    color: "#000",
  },
  // 橙色
  {
    fill: "#FFCDAC",
    stroke: "#FB6C0C",
    color: "#000",
  },
  // 黄色
  {
    fill: "#FFE8BF",
    stroke: "#FFA02C",
    color: "#000",
  },
  // 绿色
  {
    fill: "#D6F2E9",
    stroke: "#24B079",
    color: "#000",
  },
  // 蓝色
  {
    fill: "#B8D9FF",
    stroke: "#3F71FB",
    color: "#000",
  },
  // 紫色
  {
    fill: "#E8E4FF",
    stroke: "#A67FFF",
    color: "#000",
  },
  // 粉色
  {
    fill: "#FFE6F2",
    stroke: "#FF6A63",
    color: "#000",
  },
  // 灰色
  {
    fill: "#F2F2F2",
    stroke: "#808080",
    color: "#000",
  },
];

const fillWithoutStrokeColors: ColorOption[] = [
  {
    fill: "#FF6A63",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#FB6C0C",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#FFA02C",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#24B079",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#3F71FB",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#A67FFF",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#FF6A63",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#808080",
    stroke: "transparent",
    color: "#fff",
  },
];

const transparentFillColors: ColorOption[] = [
  {
    fill: "transparent",
    stroke: "#FF6A63",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#FB6C0C",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#FFA02C",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#24B079",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#3F71FB",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#A67FFF",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#FF6A63",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#808080",
    color: "currentColor",
  },
];

// 颜色设置器组件
const ColorSetterComponent: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  const handleOnSelectColor = useMemoizedFn((color: ColorOption) => {
    const newElement = produce(element, (draft) => {
      draft.stroke = color.stroke;
      draft.strokeOpacity = 1;
      draft.fill = color.fill;
      draft.fillOpacity = 1;
      draft.color = color.color;
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
          marginLeft: 24,
          backgroundColor: "white",
          padding: 8,
        },
      }}
      content={
        <div className="flex flex-col text-black gap-2">
          <Colors colors={fillWithStrokeColors} onClick={handleOnSelectColor} />
          <Colors
            colors={fillWithoutStrokeColors}
            onClick={handleOnSelectColor}
          />
          <Colors
            colors={transparentFillColors}
            onClick={handleOnSelectColor}
          />
        </div>
      }
    >
      <Tooltip title={"颜色"} placement={"left"}>
        <div className={styles.item}>
          <BiSolidColorFill width={20} height={20} />
        </div>
      </Tooltip>
    </Popover>
  );
};

// 颜色设置器实现
export class ColorSetter extends BaseGeometrySetter {
  constructor() {
    // 所有几何图形都可以设置颜色，所以使用通配符 "*"
    super("color-setter", "颜色设置器", ["*"], 100);
  }

  getIcon(): React.ReactNode {
    return <BiSolidColorFill />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return ColorSetterComponent;
  }
}
