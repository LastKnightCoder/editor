import React, { memo } from "react";
import { Tooltip } from "antd";

import For from "@/components/For";

import useTheme from "../../../../hooks/useTheme";

import styles from "./index.module.less";

const themeColors = [
  {
    label: "灰色",
    light: "#8f959e",
    dark: "#757575",
  },
  {
    label: "红色",
    light: "#e33a32",
    dark: "#fa7873",
  },
  {
    label: "橙色",
    light: "#e57d05",
    dark: "#f5a54a",
  },
  {
    label: "黄色",
    light: "#dc9b04",
    dark: "#fcd456",
  },
  {
    label: "绿色",
    light: "#2ea121",
    dark: "#6dd162",
  },
  {
    label: "蓝色",
    light: "#245bdb",
    dark: "#70a0ff",
  },
  {
    label: "紫色",
    light: "#6425d0",
    dark: "#a472fc",
  },
];

interface IColorSelectProps {
  onClick: (
    event: React.MouseEvent,
    lightColor?: string,
    darkColor?: string,
  ) => void;
  open: boolean;
}

const ColorSelect = memo((props: IColorSelectProps) => {
  const { onClick, open } = props;

  const { isDark } = useTheme();

  if (!open) {
    return null;
  }

  return (
    <div className={styles.colorSelectContainer}>
      <Tooltip title={"默认颜色"}>
        <div
          className={styles.item}
          onClick={(e) => {
            onClick(e, undefined, undefined);
          }}
          style={{ color: undefined }}
        >
          A
        </div>
      </Tooltip>
      <For
        data={themeColors}
        renderItem={(color) => (
          <Tooltip title={color.label} key={color.label}>
            <div
              className={styles.item}
              onClick={(e) => {
                onClick(e, color.light, color.dark);
              }}
              style={{ color: isDark ? color.dark : color.light }}
            >
              A
            </div>
          </Tooltip>
        )}
      />
    </div>
  );
});

export default ColorSelect;
