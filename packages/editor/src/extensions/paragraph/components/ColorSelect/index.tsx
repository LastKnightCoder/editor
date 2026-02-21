import { memo } from "react";
import ColorSelectItem from "./ColorSelectItem";
import useTheme from "../../../../hooks/useTheme";
import {
  TEXT_GRADIENT_PRESETS,
  type TextGradientPresetId,
} from "../../../../constants";

const solidColors = [
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
    lightColor?: string,
    darkColor?: string,
    gradientPreset?: TextGradientPresetId,
  ) => void;
}

const ColorSelect = memo((props: IColorSelectProps) => {
  const { onClick } = props;
  const { isDark } = useTheme();
  const gradientColors = Object.values(TEXT_GRADIENT_PRESETS);

  return (
    <div
      className={
        "flex flex-col gap-2 px-4 py-3 rounded-2xl relative z-[10060] " +
        "bg-white/90 dark:bg-slate-900/85 border border-white/40 dark:border-white/10 " +
        "backdrop-blur-2xl backdrop-saturate-150 shadow-[0_18px_45px_rgba(15,23,42,0.25)] " +
        "dark:shadow-[0_22px_60px_rgba(2,6,23,0.7)]"
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          纯色
        </span>
        <div className="h-px flex-1 bg-slate-200/90 dark:bg-slate-700/60" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ColorSelectItem
          label={"默认颜色"}
          lightColor={undefined}
          darkColor={undefined}
          onClick={onClick}
          isDark={isDark}
        />
        {solidColors.map((color) => (
          <ColorSelectItem
            key={`solid-${color.label}`}
            label={color.label}
            lightColor={color.light}
            darkColor={color.dark}
            onClick={onClick}
            isDark={isDark}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          渐变
        </span>
        <div className="h-px flex-1 bg-slate-200/90 dark:bg-slate-700/60" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {gradientColors.map((gradient) => (
          <ColorSelectItem
            key={`gradient-${gradient.id}`}
            label={gradient.label}
            gradientPreset={gradient.id}
            gradientPreview={isDark ? gradient.dark : gradient.light}
            onClick={onClick}
            isDark={isDark}
          />
        ))}
      </div>
    </div>
  );
});

export default ColorSelect;
