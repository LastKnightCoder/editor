import { memo, CSSProperties } from "react";
import type {
  WeReadHighlightStyle,
  WeReadColorStyle,
} from "../../types/elements";
import useTheme from "@/hooks/useTheme";

interface HighlightTextProps {
  text: string;
  style: WeReadHighlightStyle;
  colorStyle: WeReadColorStyle;
}

// 颜色映射：微信读书颜色样式 -> CSS 颜色
const colorStyleMap = {
  light: {
    1: { name: "红色", color: "#ef4444", backgroundColor: "#fef2f2" }, // 红色
    2: { name: "紫色", color: "#a855f7", backgroundColor: "#faf5ff" }, // 紫色
    3: { name: "蓝色", color: "#3b82f6", backgroundColor: "#eff6ff" }, // 蓝色
    4: { name: "绿色", color: "#22c55e", backgroundColor: "#f0fdf4" }, // 绿色
    5: { name: "黄色", color: "#eab308", backgroundColor: "#fefce8" }, // 黄色
  },
  dark: {
    1: { name: "红色", color: "#f87171", backgroundColor: "#450a0a" },
    2: { name: "紫色", color: "#c084fc", backgroundColor: "#3b0764" },
    3: { name: "蓝色", color: "#60a5fa", backgroundColor: "#1e3a8a" },
    4: { name: "绿色", color: "#4ade80", backgroundColor: "#14532d" },
    5: { name: "黄色", color: "#facc15", backgroundColor: "#422006" },
  },
};

export const HighlightText: React.FC<HighlightTextProps> = memo(
  ({ text, style, colorStyle }) => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const colorMap = isDark ? colorStyleMap.dark : colorStyleMap.light;
    const { color, backgroundColor } = colorMap[colorStyle] || colorMap[5];

    const baseStyle: CSSProperties = {
      color,
      lineHeight: "1.6",
    };

    // 0=下划线，1=背景高亮（马克笔），2=波浪线
    if (style === 0) {
      // 下划线
      return (
        <span
          style={{
            ...baseStyle,
            textDecoration: "underline",
            textDecorationColor: color,
            textDecorationThickness: "2px",
            textUnderlineOffset: "3px",
          }}
        >
          {text}
        </span>
      );
    } else if (style === 1) {
      // 背景高亮（马克笔）
      return (
        <span
          style={{
            ...baseStyle,
            backgroundColor,
            padding: "2px 4px",
            borderRadius: "2px",
          }}
        >
          {text}
        </span>
      );
    } else if (style === 2) {
      // 波浪线
      return (
        <span
          style={{
            ...baseStyle,
            textDecoration: "underline wavy",
            textDecorationColor: color,
            textDecorationThickness: "2px",
            textUnderlineOffset: "3px",
          }}
        >
          {text}
        </span>
      );
    }

    // 默认：下划线
    return (
      <span
        style={{
          ...baseStyle,
          textDecoration: "underline",
          textDecorationColor: color,
        }}
      >
        {text}
      </span>
    );
  },
);

HighlightText.displayName = "HighlightText";

// 导出颜色映射供选择器使用
export { colorStyleMap };
