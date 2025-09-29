import React from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { Popover, Tooltip } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import styles from "./setters.module.less";
import {
  MdOutlineFormatAlignJustify,
  MdOutlineFormatAlignLeft,
  MdOutlineFormatAlignRight,
  MdOutlineFormatAlignCenter,
} from "react-icons/md";
import useTheme from "@/hooks/useTheme";

const alignOptions = [
  {
    value: "left",
    icon: <MdOutlineFormatAlignLeft />,
  },
  {
    value: "center",
    icon: <MdOutlineFormatAlignCenter />,
  },
  {
    value: "right",
    icon: <MdOutlineFormatAlignRight />,
  },
] as const;

// 文本对齐设置器组件
const AlignSetterComponent: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  const { isDark } = useTheme();
  const handleOnSelectAlign = useMemoizedFn(
    (value: "left" | "center" | "right") => {
      const newElement = produce(element, (draft) => {
        if (draft.text) {
          draft.text.align = value;
        }
      });
      onChange(newElement);
    },
  );

  // 如果元素没有文本属性，不显示对齐设置
  if (!element.text) {
    return null;
  }

  return (
    <Popover
      arrow={false}
      trigger={"click"}
      placement={"right"}
      styles={{
        body: {
          marginLeft: 24,
          padding: 8,
        },
      }}
      content={
        <div
          className={classnames(styles.alignSelect, {
            [styles.dark]: isDark,
          })}
        >
          {alignOptions.map((align) => (
            <div
              key={align.value}
              className={classnames(styles.item, {
                [styles.active]: align.value === element.text?.align,
              })}
              onClick={() => handleOnSelectAlign(align.value)}
            >
              {align.icon}
            </div>
          ))}
        </div>
      }
    >
      <Tooltip title={"文字对齐"} placement={"left"}>
        <div
          className={classnames(styles.item, {
            [styles.dark]: isDark,
          })}
        >
          <MdOutlineFormatAlignJustify />
        </div>
      </Tooltip>
    </Popover>
  );
};

// 文本对齐设置器实现
export class AlignSetter extends BaseGeometrySetter {
  constructor() {
    // 只有包含文本的几何图形才需要对齐设置
    super("align-setter", "文本对齐设置器", ["*"], 80);
  }

  getIcon(): React.ReactNode {
    return <MdOutlineFormatAlignJustify />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return AlignSetterComponent;
  }
}
