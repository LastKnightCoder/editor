import { memo } from "react";

import For from "@/components/For";
import ColorSelectItem from "./ColorSelectItem";
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
  onClick: (lightColor?: string, darkColor?: string) => void;
}

const ColorSelect = memo((props: IColorSelectProps) => {
  const { onClick } = props;

  const { isDark } = useTheme();

  return (
    <div className={styles.colorSelectContainer}>
      <ColorSelectItem
        label={"默认颜色"}
        lightColor={undefined}
        darkColor={undefined}
        onClick={onClick}
        isDark={isDark}
      />
      <For
        data={themeColors}
        renderItem={(color) => (
          <ColorSelectItem
            label={color.label}
            lightColor={color.light}
            darkColor={color.dark}
            onClick={onClick}
            isDark={isDark}
          />
        )}
      />
    </div>
  );
});

export default ColorSelect;
