import React from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { Popover, Tooltip, Slider, ConfigProvider, theme } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import styles from "./setters.module.less";
import { RiRoundedCorner } from "react-icons/ri";
import classnames from "classnames";
import useTheme from "@/hooks/useTheme";
import { GeometryUtil } from "@/components/WhiteBoard/utils";

// 矩形圆角设置器组件
const RectangleCornerRadiusSetterComponent: React.FC<
  GeometrySetterComponentProps
> = ({ element, onChange }) => {
  const { isDark } = useTheme();
  // 从 extraInfo 中获取圆角值，如果不存在则默认为 0
  const cornerRadius = element.extraInfo?.cornerRadius || 0;

  const handleCornerRadiusChange = useMemoizedFn((value: number) => {
    const newElement = produce(element, (draft) => {
      if (!draft.extraInfo) {
        draft.extraInfo = {};
      }
      draft.extraInfo.cornerRadius = value;
    });
    GeometryUtil.setLocalStorage("cornerRadius", String(value));
    onChange(newElement);
  });

  return (
    <Popover
      arrow={false}
      trigger={"click"}
      placement={"right"}
      styles={{
        container: {
          background: "transparent",
          boxShadow: "none",
          padding: 0,
          marginLeft: 12,
        },
      }}
      content={
        <div
          className={classnames(styles.sliderPopover, {
            [styles.dark]: isDark,
          })}
        >
          <ConfigProvider
            theme={{
              algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
            }}
          >
            <Slider
              min={0}
              max={50}
              step={1}
              value={cornerRadius}
              onChange={handleCornerRadiusChange}
              tooltip={{ formatter: (value) => `${value}px` }}
            />
          </ConfigProvider>
        </div>
      }
    >
      <Tooltip title={"圆角"} placement={"left"}>
        <div className={styles.item}>
          <RiRoundedCorner />
        </div>
      </Tooltip>
    </Popover>
  );
};

// 矩形圆角设置器实现
export class RectangleCornerRadiusSetter extends BaseGeometrySetter {
  constructor() {
    // 只适用于矩形
    super(
      "rectangle-corner-radius-setter",
      "矩形圆角设置器",
      ["rectangle"],
      70,
    );
  }

  getIcon(): React.ReactNode {
    return <RiRoundedCorner />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return RectangleCornerRadiusSetterComponent;
  }
}
