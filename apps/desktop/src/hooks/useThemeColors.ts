import useBackgroundMode from "./useBackgroundMode";
import useSettingStore from "@/stores/useSettingStore";
import { ACCENT_COLORS, ACCENT_OKLCH } from "@/constants/accent";

/**
 * 主题 token 的 Tailwind class 封装 — 全应用最大的样式 API。
 *
 * 所有颜色均来自 styles/theme-colors.css 的中性表面 + accent 体系,
 * solid/gradient 双模式已合并(柔光只影响页面底层,组件样式统一)。
 */
const CLASSES = {
  // 交互
  hoverClass: "hover:bg-[var(--th-bg-hover)]",
  hoverTextClass: "hover:text-[var(--th-hover-text)]",
  activeClass: "bg-[var(--th-accent-soft)] text-[var(--th-active-text)]",
  activeBgClass: "bg-[var(--th-accent-soft)]",
  activeTextClass: "text-[var(--th-active-text)]",

  // 边框
  borderClass: "border-[var(--th-border)]",
  hoverBorderClass: "hover:border-[var(--th-border-hover)]",
  focusBorderClass: "border-[var(--th-border-focus)]",
  focusRingClass: "focus:[box-shadow:var(--th-focus-ring)]",
  activeBorderClass: "border-[var(--th-border-focus)]",
  divideClass: "border-[var(--th-divide)]",

  // 按钮
  primaryButtonClass:
    "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] hover:bg-[var(--th-btn-hover)] active:bg-[var(--th-btn-active)]",
  buttonTextClass: "text-[var(--th-btn-text)]",
  buttonBg: "bg-[var(--th-btn-bg)]",

  // 文字
  textClass: "text-[var(--th-text)]",
  secondaryTextClass: "text-[var(--th-text-secondary)]",

  // 卡片
  cardBgClass: "bg-[var(--th-card-bg)]",
  cardBorderClass: "border-[var(--th-border)]",

  // 输入
  inputBgClass: "bg-[var(--th-input-bg)]",

  // 图标
  iconBgClass: "bg-[var(--th-tag-bg)]",
  iconTextClass: "text-[var(--th-active-text)]",

  // 标签
  tagBgClass: "bg-[var(--th-tag-bg)]",
  tagTextClass: "text-[var(--th-tag-text)]",

  // 面板
  glassPanelBg: "bg-[var(--th-glass)] backdrop-blur-xl",
  modalPanelBg: "bg-[var(--th-bg-elevated)]",

  // 徽章
  badgeBgClass: "bg-[var(--th-btn-bg)]",
  badgeTextClass: "text-[var(--th-btn-text)]",

  // 装饰
  gradientClass:
    "bg-linear-to-r from-[var(--th-accent)] to-[var(--th-accent-hover)]",
} as const;

/** 图表/图形场景的 raw 色值,由 accent 的 h/c 统一派生 */
const buildAccentRaw = (accent: string, isDark: boolean) => {
  const config =
    ACCENT_OKLCH[accent as keyof typeof ACCENT_OKLCH] ?? ACCENT_OKLCH.indigo;
  const h = config.h;
  const s = Math.min(Math.round(config.c * 380), 70);
  const [lightColor, darkColor] =
    ACCENT_COLORS[accent as keyof typeof ACCENT_COLORS] ?? ACCENT_COLORS.indigo;
  const accentColor = isDark ? darkColor : lightColor;

  return {
    accentColor,
    accentSoftBg: isDark
      ? `hsla(${h}, ${s}%, 70%, 0.35)`
      : `hsla(${h}, ${s}%, 30%, 0.25)`,
    twoToneColor: accentColor,
    graphNodeFill: `hsl(${h}, ${s}%, 58%)`,
    graphNodeStroke: `hsl(${h}, ${Math.round(s * 1.08)}%, 40%)`,
    graphEdgeStroke: `hsl(${h}, 40%, 80%)`,
    graphNodeFillDark: `hsl(${h}, ${Math.round(s * 0.85)}%, 28%)`,
    graphNodeStrokeDark: `hsl(${h}, ${s}%, 48%)`,
    graphEdgeStrokeDark: `hsla(${h}, 20%, 50% / 0.5)`,
    graphNodeSelectedFill: `hsl(${h}, ${Math.min(Math.round(s * 1.3), 90)}%, ${isDark ? 72 : 80}%)`,
    graphNodeSelectedStroke: `hsl(${h}, ${Math.min(Math.round(s * 1.3), 90)}%, ${isDark ? 55 : 52}%)`,
    graphNodeCurrentFill: `hsla(${h}, ${s}%, ${isDark ? 72 : 58}% / 0.58)`,
    graphNodeCurrentStroke: accentColor,
    timelineRingColor: lightColor,
    timelineRingColorDark: darkColor,
  };
};

const useThemeColors = () => {
  const { accent } = useBackgroundMode();
  const isDarkMode = useSettingStore((state) => state.setting.darkMode);

  return { ...CLASSES, ...buildAccentRaw(accent, isDarkMode) };
};

export default useThemeColors;
