import { memo } from "react";
import For from "@/components/For";
import ColorSelectItem from "./ColorSelectItem";
import useTheme from "../../../../hooks/useTheme";

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
    <div
      className={
        "flex items-center gap-3 px-4 py-3 rounded-2xl relative z-[10060] " +
        "bg-white/90 dark:bg-slate-900/85 border border-white/40 dark:border-white/10 " +
        "backdrop-blur-2xl backdrop-saturate-150 shadow-[0_18px_45px_rgba(15,23,42,0.25)] " +
        "dark:shadow-[0_22px_60px_rgba(2,6,23,0.7)]"
      }
    >
      <ColorSelectItem
        label={"默认颜色"}
        lightColor={undefined}
        darkColor={undefined}
        onClick={onClick}
        isDark={isDark}
      />
      <div className="h-6 w-px bg-slate-200/90 dark:bg-slate-700/60" />
      <div className="flex flex-wrap items-center gap-3">
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
