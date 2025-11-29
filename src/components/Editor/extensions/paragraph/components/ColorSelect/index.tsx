import { memo } from "react";
import For from "@/components/For";
import ColorSelectItem from "./ColorSelectItem";
import useTheme from "../../../../hooks/useTheme";
import useThemeColors from "@/hooks/useThemeColors";
import classnames from "classnames";

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
  const themeColorsConfig = useThemeColors();

  return (
    <div
      className={classnames(
        "flex items-center gap-2 p-2 rounded-xl shadow-xl border backdrop-blur-xl backdrop-saturate-150",
        themeColorsConfig.glassPanelBg,
        themeColorsConfig.borderClass,
      )}
    >
      <ColorSelectItem
        label={"默认颜色"}
        lightColor={undefined}
        darkColor={undefined}
        onClick={onClick}
        isDark={isDark}
      />
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
      <div className="flex items-center gap-2">
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
    </div>
  );
});

export default ColorSelect;
