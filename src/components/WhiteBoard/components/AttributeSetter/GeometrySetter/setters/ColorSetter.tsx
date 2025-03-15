import React from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { BiSolidColorFill } from "react-icons/bi";
import { Popover, Tooltip } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import styles from "./setters.module.less";

interface ColorOption {
  fill: string;
  stroke: string;
  color: string;
}

const colors: ColorOption[] = [
  {
    fill: "#FF585D",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#24B079",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#865CC2",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#3F71FB",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#f4d63b",
    stroke: "transparent",
    color: "#fff",
  },
  {
    fill: "#fff",
    stroke: "#FF585D",
    color: "#FF585D",
  },
  {
    fill: "#fff",
    stroke: "#24B079",
    color: "#24B079",
  },
  {
    fill: "#fff",
    stroke: "#865CC2",
    color: "#865CC2",
  },
  {
    fill: "#fff",
    stroke: "#3F71FB",
    color: "#3F71FB",
  },
  {
    fill: "#fff",
    stroke: "#f4d63b",
    color: "#f4d63b",
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
        },
      }}
      content={
        <div className={styles.colorSelect}>
          {colors.map((color) => {
            return (
              <div
                className={styles.item}
                key={`${color.fill}-${color.stroke}-${color.color}`}
                style={{
                  background: color.fill,
                  border: `2px solid ${color.stroke}`,
                  color: color.color,
                }}
                onClick={() => {
                  handleOnSelectColor(color);
                }}
              >
                Aa
              </div>
            );
          })}
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
