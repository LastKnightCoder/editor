import useBackgroundMode from "./useBackgroundMode";
import useSettingStore from "@/stores/useSettingStore";

const BASE_CLASSES = {
  hoverClass: "hover:bg-[var(--th-hover-bg)]",
  hoverTextClass: "hover:text-[var(--th-hover-text)]",
  borderClass: "border-[var(--th-border)]",
  divideClass: "bg-[var(--th-divide)]",
  hoverBorderClass: "hover:border-[var(--th-border-hover)]",
  focusBorderClass: "border-[var(--th-border-focus)]",
  focusRingClass: "focus:[box-shadow:var(--th-focus-ring)]",
  activeBorderClass: "border-[var(--th-border-active)]",
  activeBadgeClass: "bg-[var(--th-badge-active)]",
  activeBgClass:
    "bg-gradient-to-br from-[var(--th-active-from)] to-[var(--th-active-to)]",
  iconBgClass:
    "bg-gradient-to-br from-[var(--th-icon-from)] to-[var(--th-icon-to)]",
  iconBgDeepClass:
    "bg-gradient-to-br from-[var(--th-icon-deep-from)] to-[var(--th-icon-deep-to)]",
  iconTextClass: "text-[var(--th-icon-text)]",
  iconHoverClass: "group-hover:bg-[var(--th-icon-hover)]",
  gradientClass:
    "bg-linear-to-r from-[var(--th-gradient-from)] via-[var(--th-gradient-via)] to-[var(--th-gradient-to)]",
  inputBgClass: "bg-[var(--th-input-bg)]",
  chatMessageBg: "bg-[var(--th-chat-msg)]",
  tagCountBg: "bg-[var(--th-tag-count)]",
  buttonTextClass: "text-[var(--th-btn-text)]",
  textClass: "text-[var(--th-text)]",
  secondaryTextClass: "text-[var(--th-text-secondary)]",
  activeTextClass: "text-[var(--th-active-text)]",
  cardBorderClass: "border-[var(--th-card-border)]",
  cardBgClass: "bg-[var(--th-card-bg)]",
  pinnedCardBgClass:
    "bg-gradient-to-br from-[var(--th-pinned-from)] to-[var(--th-pinned-to)]",
  pinnedCardBorderClass: "border-[var(--th-pinned-border)]",
  tagBgClass: "bg-[var(--th-tag-bg)]",
  tagHoverBgClass: "hover:bg-[var(--th-tag-hover)]",
  tagTextClass: "text-[var(--th-tag-text)]",
  glassPanelBg: "bg-[var(--th-glass)]",
  modalPanelBg: "bg-[var(--th-modal)]",
  quoteBgClass: "bg-[var(--th-quote)]",
  badgeTextClass: "text-[var(--th-badge-text)]",
} as const;

const SOLID_CLASSES = {
  ...BASE_CLASSES,
  activeClass: "bg-[var(--th-active-bg)] text-[var(--th-active-text)]",
  primaryButtonClass:
    "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] hover:bg-[var(--th-btn-hover)] active:bg-[var(--th-btn-active)]",
  chatInputBg:
    "bg-[var(--th-chat-input)] border border-[var(--th-chat-input-border)]",
  buttonBg: "bg-[var(--th-btn-bg)]",
  badgeBgClass: "bg-[var(--th-badge-bg)]",
} as const;

const GRADIENT_CLASSES = {
  ...BASE_CLASSES,
  activeClass:
    "bg-[var(--th-active-bg)] text-[var(--th-active-text)] backdrop-blur-sm",
  primaryButtonClass:
    "bg-[var(--th-btn-bg)] backdrop-blur-sm text-[var(--th-btn-text)] hover:bg-[var(--th-btn-hover)] active:bg-[var(--th-btn-active)]",
  chatInputBg: "bg-[var(--th-chat-input)]",
  buttonBg: "bg-[var(--th-btn-bg)] backdrop-blur-sm",
  badgeBgClass: "bg-[var(--th-badge-bg)] backdrop-blur-sm",
} as const;

type GradientConfig = {
  gh: number; // graph HSL hue
  gs: number; // graph HSL saturation
  eh: number; // edge hue (sometimes differs from node hue)
  es: number; // edge saturation
  accent: [string, string]; // [light rgb, dark rgb]
  soft: [string, string]; // [light rgba, dark rgba]
};

const GRADIENTS: Record<string, GradientConfig> = {
  gradient1: {
    gh: 275,
    gs: 65,
    eh: 280,
    es: 40,
    accent: ["rgb(147, 51, 234)", "rgb(168, 85, 247)"],
    soft: ["rgba(147, 51, 234, 0.2)", "rgba(168, 85, 247, 0.35)"],
  },
  gradient2: {
    gh: 210,
    gs: 65,
    eh: 210,
    es: 40,
    accent: ["rgb(37, 99, 235)", "rgb(59, 130, 246)"],
    soft: ["rgba(37, 99, 235, 0.2)", "rgba(59, 130, 246, 0.35)"],
  },
  gradient3: {
    gh: 25,
    gs: 50,
    eh: 25,
    es: 40,
    accent: ["rgb(249, 115, 22)", "rgb(251, 146, 60)"],
    soft: ["rgba(249, 115, 22, 0.2)", "rgba(251, 146, 60, 0.35)"],
  },
  gradient4: {
    gh: 142,
    gs: 70,
    eh: 142,
    es: 38,
    accent: ["rgb(22, 163, 74)", "rgb(34, 197, 94)"],
    soft: ["rgba(22, 163, 74, 0.2)", "rgba(34, 197, 94, 0.35)"],
  },
  gradient5: {
    gh: 330,
    gs: 68,
    eh: 330,
    es: 40,
    accent: ["rgb(219, 39, 119)", "rgb(236, 72, 153)"],
    soft: ["rgba(219, 39, 119, 0.2)", "rgba(236, 72, 153, 0.35)"],
  },
  gradient6: {
    gh: 210,
    gs: 10,
    eh: 0,
    es: 0,
    accent: ["rgb(75, 85, 99)", "rgb(107, 114, 128)"],
    soft: ["rgba(75, 85, 99, 0.2)", "rgba(107, 114, 128, 0.35)"],
  },
  gradient7: {
    gh: 185,
    gs: 70,
    eh: 185,
    es: 40,
    accent: ["rgb(6, 182, 212)", "rgb(34, 211, 238)"],
    soft: ["rgba(6, 182, 212, 0.2)", "rgba(34, 211, 238, 0.35)"],
  },
  gradient8: {
    gh: 38,
    gs: 90,
    eh: 38,
    es: 40,
    accent: ["rgb(245, 158, 11)", "rgb(251, 191, 36)"],
    soft: ["rgba(245, 158, 11, 0.2)", "rgba(251, 191, 36, 0.35)"],
  },
  gradient9: {
    gh: 0,
    gs: 70,
    eh: 0,
    es: 40,
    accent: ["rgb(239, 68, 68)", "rgb(248, 113, 113)"],
    soft: ["rgba(239, 68, 68, 0.2)", "rgba(248, 113, 113, 0.35)"],
  },
};

const buildGradientRaw = (c: GradientConfig, isDark: boolean) => {
  const i = isDark ? 1 : 0;
  const a = c.accent[i];
  return {
    graphNodeFill: `hsl(${c.gh}, ${c.gs}%, 58%)`,
    graphNodeStroke: `hsl(${c.gh}, ${Math.round(c.gs * 1.08)}%, 40%)`,
    graphEdgeStroke: `hsl(${c.eh}, ${c.es}%, 80%)`,
    graphNodeFillDark: `hsl(${c.gh}, ${Math.round(c.gs * 0.85)}%, 28%)`,
    graphNodeStrokeDark: `hsl(${c.gh}, ${c.gs}%, 48%)`,
    graphEdgeStrokeDark: `hsla(${c.eh}, ${c.es}%, 20%, 50%)`,
    graphNodeSelectedFill: `hsl(${c.gh}, ${Math.round(c.gs * 1.3)}%, 80%)`,
    graphNodeSelectedStroke: `hsl(${c.gh}, ${Math.round(c.gs * 1.3)}%, 52%)`,
    graphNodeCurrentFill: a.replace("rgb(", "rgba(").replace(")", ", 0.58)"),
    graphNodeCurrentStroke: a,
    timelineRingColor: c.accent[0],
    timelineRingColorDark: c.accent[1],
    accentColor: a,
    accentSoftBg: c.soft[i],
    twoToneColor: a,
  };
};

const buildSolidRaw = (isDark: boolean) => ({
  graphNodeFill: "hsl(210, 10%, 62%)",
  graphNodeStroke: "hsl(210, 10%, 44%)",
  graphEdgeStroke: "hsl(0, 0%, 78%)",
  graphNodeFillDark: "hsl(0, 0%, 16%)",
  graphNodeStrokeDark: "hsl(0, 0%, 34%)",
  graphEdgeStrokeDark: "hsla(0, 0%, 22%, 60%)",
  graphNodeSelectedFill: isDark ? "hsl(0, 0%, 68%)" : "hsl(0, 0%, 96%)",
  graphNodeSelectedStroke: isDark ? "hsl(0, 0%, 52%)" : "hsl(0, 0%, 62%)",
  graphNodeCurrentFill: isDark
    ? "rgba(107, 114, 128, 0.58)"
    : "rgba(71, 85, 105, 0.86)",
  graphNodeCurrentStroke: isDark ? "rgb(107, 114, 128)" : "rgb(30, 41, 59)",
  timelineRingColor: "rgb(107, 114, 128)",
  timelineRingColorDark: "rgb(156, 163, 175)",
  accentColor: isDark ? "hsl(168, 50%, 70%)" : "hsl(168, 50%, 30%)",
  accentSoftBg: isDark
    ? "hsla(168, 50%, 70%, 0.35)"
    : "hsla(168, 50%, 30%, 0.25)",
  twoToneColor: isDark ? "hsl(168, 50%, 70%)" : "hsl(168, 50%, 30%)",
});

const useThemeColors = () => {
  const { backgroundType, isSolid } = useBackgroundMode();
  const isDarkMode = useSettingStore((state) => state.setting.darkMode);

  const classes = isSolid ? SOLID_CLASSES : GRADIENT_CLASSES;

  if (isSolid) {
    return { ...classes, ...buildSolidRaw(isDarkMode) };
  }

  const config = GRADIENTS[backgroundType] ?? GRADIENTS.gradient1;
  const raw = buildGradientRaw(config, isDarkMode);

  if (backgroundType === "gradient6") {
    raw.graphNodeSelectedFill = isDarkMode
      ? "hsl(210, 16%, 70%)"
      : "hsl(210, 22%, 94%)";
    raw.graphNodeSelectedStroke = isDarkMode
      ? "hsl(210, 20%, 50%)"
      : "hsl(210, 26%, 60%)";
    raw.graphNodeCurrentFill = isDarkMode
      ? "rgba(107, 114, 128, 0.58)"
      : "rgba(107, 114, 128, 0.58)";
    raw.graphNodeCurrentStroke = isDarkMode
      ? "rgb(107, 114, 128)"
      : "rgb(107, 114, 128)";
  }

  return { ...classes, ...raw };
};

export default useThemeColors;
