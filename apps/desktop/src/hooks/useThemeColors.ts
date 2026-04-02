import useBackgroundMode from "./useBackgroundMode";
import useSettingStore from "@/stores/useSettingStore";

/**
 * Hook to get theme-aware colors based on current background type
 * @returns {Object} Theme color classes
 * @property {string} hoverClass - Hover state background class
 * @property {string} activeClass - Active state background and text classes
 * @property {string} hoverTextClass - Hover state text color class for icons/text
 * @property {string} borderClass - Default border color class
 * @property {string} hoverBorderClass - Hover state border color class
 * @property {string} focusBorderClass - Focus/active state border color class
 * @property {string} chatMessageBg - Chat message background class
 * @property {string} chatInputBg - Chat input background class
 * @property {string} chatContainerBg - Chat container background class
 * @property {string} tagCountBg - Tag count badge background class
 * @property {string} buttonBg - Button background class
 * @property {string} buttonTextClass - Button text color class
 * @property {string} textClass - Default text color class
 * @property {string} secondaryTextClass - Secondary/muted text color class
 * @property {string} activeTextClass - Active text color class
 * @property {string} cardBorderClass - Card border color class
 * @property {string} cardBgClass - Card background class
 * @property {string} pinnedCardBgClass - Pinned card background class
 * @property {string} pinnedCardBorderClass - Pinned card border class
 * @property {string} tagBgClass - Tag background class
 * @property {string} tagHoverBgClass - Tag hover background class
 * @property {string} tagTextClass - Tag text color class
 * @property {string} glassPanelBg - Glass panel background class
 * @property {string} quoteBgClass - Quote/highlight background class
 * @property {string} badgeBgClass - Badge background class
 * @property {string} badgeTextClass - Badge text color class
 * @property {string} timelineRingColor - Timeline ring color (hex/rgb)
 * @property {string} timelineRingColorDark - Timeline ring color for dark mode (hex/rgb)
 * @property {string} inputBgClass - Input/dropdown background class with theme colors
 * @property {string} iconBgClass - Light icon background class (for module cards)
 * @property {string} iconBgDeepClass - Deep icon background class (for app info)
 * @property {string} iconTextClass - Icon text color class matching theme colors
 * @property {string} iconHoverClass - Hover background class for icon-only buttons (group-hover)
 */
const useThemeColors = () => {
  const { backgroundType, isSolid } = useBackgroundMode();

  const isDarkMode = useSettingStore((state) => state.setting.darkMode);

  const solidAccentColor = isDarkMode
    ? "hsl(168, 50%, 70%)"
    : "hsl(168, 50%, 30%)";
  const solidAccentSoftBg = isDarkMode
    ? "hsla(168, 50%, 70%, 0.35)"
    : "hsla(168, 50%, 30%, 0.25)";
  const gradient1AccentColor = isDarkMode
    ? "rgb(168, 85, 247)"
    : "rgb(147, 51, 234)";
  const gradient1AccentSoftBg = isDarkMode
    ? "rgba(168, 85, 247, 0.35)"
    : "rgba(147, 51, 234, 0.2)";
  const gradient2AccentColor = isDarkMode
    ? "rgb(59, 130, 246)"
    : "rgb(37, 99, 235)";
  const gradient2AccentSoftBg = isDarkMode
    ? "rgba(59, 130, 246, 0.35)"
    : "rgba(37, 99, 235, 0.2)";
  const gradient3AccentColor = isDarkMode
    ? "rgb(251, 146, 60)"
    : "rgb(249, 115, 22)";
  const gradient3AccentSoftBg = isDarkMode
    ? "rgba(251, 146, 60, 0.35)"
    : "rgba(249, 115, 22, 0.2)";
  const gradient4AccentColor = isDarkMode
    ? "rgb(34, 197, 94)"
    : "rgb(22, 163, 74)";
  const gradient4AccentSoftBg = isDarkMode
    ? "rgba(34, 197, 94, 0.35)"
    : "rgba(22, 163, 74, 0.2)";
  const gradient5AccentColor = isDarkMode
    ? "rgb(236, 72, 153)"
    : "rgb(219, 39, 119)";
  const gradient5AccentSoftBg = isDarkMode
    ? "rgba(236, 72, 153, 0.35)"
    : "rgba(219, 39, 119, 0.2)";
  const gradient6AccentColor = isDarkMode
    ? "rgb(107, 114, 128)"
    : "rgb(75, 85, 99)";
  const gradient6AccentSoftBg = isDarkMode
    ? "rgba(107, 114, 128, 0.35)"
    : "rgba(75, 85, 99, 0.2)";
  const gradient7AccentColor = isDarkMode
    ? "rgb(34, 211, 238)"
    : "rgb(6, 182, 212)";
  const gradient7AccentSoftBg = isDarkMode
    ? "rgba(34, 211, 238, 0.35)"
    : "rgba(6, 182, 212, 0.2)";
  const gradient8AccentColor = isDarkMode
    ? "rgb(251, 191, 36)"
    : "rgb(245, 158, 11)";
  const gradient8AccentSoftBg = isDarkMode
    ? "rgba(251, 191, 36, 0.35)"
    : "rgba(245, 158, 11, 0.2)";
  const gradient9AccentColor = isDarkMode
    ? "rgb(248, 113, 113)"
    : "rgb(239, 68, 68)";
  const gradient9AccentSoftBg = isDarkMode
    ? "rgba(248, 113, 113, 0.35)"
    : "rgba(239, 68, 68, 0.2)";

  if (isSolid) {
    return {
      hoverClass: "hover:bg-gray-100 dark:hover:bg-zinc-800",
      activeClass:
        "bg-[#eee] text-gray-900 dark:bg-zinc-700 dark:text-gray-100",
      hoverTextClass: "hover:text-gray-900 dark:hover:text-gray-100",
      borderClass: "border-[#f0f0f0] dark:border-[#2a2a2a]",
      divideCalass: "bg-[#f0f0f0] dark:bg-[#2a2a2a]",
      hoverBorderClass: "hover:border-[#eaeaea] dark:hover:border-[#3a3a3a]",
      focusBorderClass: "border-[#f0f0f0] dark:border-[#2a2a2a]",
      focusRingClass:
        "focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(107,107,107,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(154,154,154,0.25)]",
      activeBorderClass: "border-gray-300 dark:border-gray-700",
      activeBadgeClass: "bg-gray-100 dark:bg-zinc-800",
      activeBgClass:
        "bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900",
      iconBgClass:
        "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800/40 dark:to-gray-700/40",
      iconBgDeepClass:
        "bg-gradient-to-br from-gray-700 to-gray-800 dark:from-gray-600/60 dark:to-gray-700/60",
      iconTextClass: "text-gray-700 dark:text-gray-300",
      iconHoverClass: "group-hover:bg-gray-100 dark:group-hover:bg-zinc-800",
      gradientClass:
        "bg-linear-to-r from-gray-500 via-gray-400 to-gray-500 dark:from-gray-600 dark:via-gray-500 dark:to-gray-600",
      primaryButtonClass:
        "bg-zinc-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-zinc-800 dark:hover:bg-gray-200 active:bg-zinc-700 dark:active:bg-gray-300",
      inputBgClass: "bg-gray-50 dark:bg-zinc-950",
      // Chat background colors for solid mode
      chatMessageBg: "bg-gray-50/80 dark:bg-zinc-800/70",
      chatInputBg:
        "bg-white dark:bg-zinc-950 border border-gray-200 dark:border-gray-800",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-gray-100 dark:bg-zinc-800",
      buttonBg: "bg-zinc-900 dark:bg-gray-100",
      buttonTextClass: "text-white dark:text-gray-900",
      // Text colors
      textClass: "text-gray-600 dark:text-gray-400",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-gray-900 dark:text-gray-100",
      // Card colors
      cardBorderClass: "border-gray-200 dark:border-zinc-700/60",
      cardBgClass: "bg-gray-50/80 dark:bg-zinc-800/70",
      pinnedCardBgClass:
        "bg-gradient-to-br from-gray-200/50 to-gray-50/80 dark:from-gray-800/50 dark:to-gray-900/50",
      pinnedCardBorderClass: "border-gray-300 dark:border-gray-700",
      // Tag colors
      tagBgClass: "bg-gray-100 dark:bg-zinc-800",
      tagHoverBgClass: "hover:bg-gray-200 dark:hover:bg-zinc-700",
      tagTextClass: "text-gray-700 dark:text-gray-300",
      // Glass panel colors
      glassPanelBg: "bg-white/95 dark:bg-zinc-800/65",
      // Quote and badge colors
      quoteBgClass: "bg-gray-100 dark:bg-zinc-800",
      badgeBgClass: "bg-blue-500",
      badgeTextClass: "text-white",
      // Timeline colors
      timelineRingColor: "rgb(107, 114, 128)", // gray-500
      timelineRingColorDark: "rgb(156, 163, 175)", // gray-400
      // Graph colors (Grayscale)
      graphNodeFill: "hsl(0, 0%, 42%)",
      graphNodeStroke: "hsl(0, 0%, 24%)",
      graphEdgeStroke: "hsl(0, 0%, 78%)",
      graphNodeFillDark: "hsl(0, 0%, 16%)",
      graphNodeStrokeDark: "hsl(0, 0%, 34%)",
      graphEdgeStrokeDark: "hsla(0, 0%, 22%, 60%)",
      graphNodeSelectedFill: isDarkMode ? "hsl(0, 0%, 68%)" : "hsl(0, 0%, 96%)",
      graphNodeSelectedStroke: isDarkMode
        ? "hsl(0, 0%, 52%)"
        : "hsl(0, 0%, 62%)",
      graphNodeCurrentFill: "rgba(107, 114, 128, 0.58)",
      graphNodeCurrentStroke: "rgb(107, 114, 128)",
      accentColor: solidAccentColor,
      accentSoftBg: solidAccentSoftBg,
      twoToneColor: solidAccentColor,
    };
  }

  // For gradient modes, use glassmorphism-compatible colors that match the theme
  const themeColors = {
    gradient1: {
      // Purple theme
      hoverClass: "hover:bg-purple-500/10 dark:hover:bg-purple-400/15",
      activeClass:
        "bg-purple-500/20 text-purple-700 dark:bg-purple-400/25 dark:text-purple-200 backdrop-blur-sm",
      hoverTextClass: "hover:text-purple-600 dark:hover:text-purple-400",
      borderClass: "border-purple-200/30 dark:border-purple-400/20",
      divideCalass: "bg-purple-200/30 dark:bg-purple-400/20",
      hoverBorderClass:
        "hover:border-purple-300/50 dark:hover:border-purple-400/30",
      focusBorderClass: "border-purple-500/60 dark:border-purple-400/50",
      focusRingClass:
        "focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(147,51,234,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(168,85,247,0.25)]",
      activeBorderClass: "border-purple-500/40 dark:border-purple-400/40",
      activeBadgeClass: "bg-purple-100/60 dark:bg-purple-900/40",
      activeBgClass:
        "bg-gradient-to-br from-purple-500/20 to-purple-50 dark:from-purple-400/20 dark:to-purple-950/60",
      iconBgClass:
        "bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/40 dark:to-purple-800/40",
      iconBgDeepClass:
        "bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600/80 dark:to-purple-700/80",
      iconTextClass: "text-purple-600 dark:text-purple-400",
      iconHoverClass:
        "group-hover:bg-purple-500/10 dark:group-hover:bg-purple-400/15",
      gradientClass:
        "bg-linear-to-r from-purple-500 via-purple-400 to-purple-500 dark:from-purple-600 dark:via-purple-500 dark:to-purple-600",
      primaryButtonClass:
        "bg-purple-600/80 dark:bg-purple-700/80 backdrop-blur-sm text-white dark:text-purple-100 hover:bg-purple-700/90 dark:hover:bg-purple-600/90",
      inputBgClass: "bg-purple-50/50 dark:bg-purple-950/30",
      // Chat background colors for purple theme
      chatMessageBg: "bg-purple-50 dark:bg-purple-950/60",
      chatInputBg: "bg-purple-50/80 dark:bg-purple-950/50",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-purple-100/60 dark:bg-purple-900/40",
      buttonBg: "bg-purple-600/80 dark:bg-purple-700/80 backdrop-blur-sm",
      buttonTextClass: "text-white dark:text-purple-100",
      // Text colors
      textClass: "text-gray-700 dark:text-gray-300",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-purple-700 dark:text-purple-200",
      // Card colors (使用与聊天消息相同的背景)
      cardBorderClass: "border-purple-200/30 dark:border-purple-400/20",
      cardBgClass: "bg-purple-50 dark:bg-purple-950/60",
      pinnedCardBgClass:
        "bg-gradient-to-br from-purple-500/20 to-purple-50 dark:from-purple-400/20 dark:to-purple-950/60",
      pinnedCardBorderClass: "border-purple-500/40 dark:border-purple-400/40",
      // Tag colors
      tagBgClass: "bg-purple-100/60 dark:bg-purple-900/50",
      tagHoverBgClass: "hover:bg-purple-200/70 dark:hover:bg-purple-800/60",
      tagTextClass: "text-purple-700 dark:text-purple-300",
      // Glass panel colors
      glassPanelBg: "bg-purple-50/95 dark:bg-[#1a0b2e]/90",
      // Quote and badge colors
      quoteBgClass: "bg-black/5 dark:bg-white/10",
      badgeBgClass: "bg-purple-600/80 dark:bg-purple-700/80 backdrop-blur-sm",
      badgeTextClass: "text-white dark:text-purple-100",
      // Timeline colors
      timelineRingColor: "rgb(147, 51, 234)", // purple-600
      timelineRingColorDark: "rgb(168, 85, 247)", // purple-500
      // Graph colors
      graphNodeFill: "hsl(275, 65%, 58%)",
      graphNodeStroke: "hsl(275, 65%, 40%)",
      graphEdgeStroke: "hsl(280, 40%, 80%)",
      graphNodeFillDark: "hsl(275, 55%, 28%)",
      graphNodeStrokeDark: "hsl(275, 65%, 48%)",
      graphEdgeStrokeDark: "hsla(280, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(275, 85%, 80%)",
      graphNodeSelectedStroke: "hsl(275, 85%, 52%)",
      graphNodeCurrentFill: "rgba(168, 85, 247, 0.58)",
      graphNodeCurrentStroke: "rgb(168, 85, 247)",
      accentColor: gradient1AccentColor,
      accentSoftBg: gradient1AccentSoftBg,
      twoToneColor: gradient1AccentColor,
    },
    gradient2: {
      // Blue theme
      hoverClass: "hover:bg-blue-500/10 dark:hover:bg-blue-400/15",
      activeClass:
        "bg-blue-500/20 text-blue-700 dark:bg-blue-400/25 dark:text-blue-200 backdrop-blur-sm",
      hoverTextClass: "hover:text-blue-600 dark:hover:text-blue-400",
      borderClass: "border-blue-200/30 dark:border-blue-400/20",
      divideCalass: "bg-blue-200/30 dark:bg-blue-400/20",
      hoverBorderClass:
        "hover:border-blue-300/50 dark:hover:border-blue-400/30",
      focusBorderClass: "border-blue-500/60 dark:border-blue-400/50",
      focusRingClass:
        "focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(37,99,235,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]",
      activeBorderClass: "border-blue-500/40 dark:border-blue-400/40",
      activeBadgeClass: "bg-blue-100/60 dark:bg-blue-900/40",
      activeBgClass:
        "bg-gradient-to-br from-blue-500/20 to-blue-50 dark:from-blue-400/20 dark:to-blue-950/60",
      iconBgClass:
        "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/40",
      iconBgDeepClass:
        "bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600/80 dark:to-blue-700/80",
      iconTextClass: "text-blue-600 dark:text-blue-400",
      iconHoverClass:
        "group-hover:bg-blue-500/10 dark:group-hover:bg-blue-400/15",
      gradientClass:
        "bg-linear-to-r from-blue-500 via-blue-400 to-blue-500 dark:from-blue-600 dark:via-blue-500 dark:to-blue-600",
      primaryButtonClass:
        "bg-blue-600/80 dark:bg-blue-700/80 backdrop-blur-sm text-white dark:text-blue-100 hover:bg-blue-700/90 dark:hover:bg-blue-600/90",
      inputBgClass: "bg-blue-50/50 dark:bg-blue-950/30",
      // Chat background colors for blue theme
      chatMessageBg: "bg-blue-50 dark:bg-blue-950/60",
      chatInputBg: "bg-blue-50/80 dark:bg-blue-950/50",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-blue-100/60 dark:bg-blue-900/40",
      buttonBg: "bg-blue-600/80 dark:bg-blue-700/80 backdrop-blur-sm",
      buttonTextClass: "text-white dark:text-blue-100",
      // Text colors
      textClass: "text-gray-700 dark:text-gray-300",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-blue-700 dark:text-blue-200",
      // Card colors (使用与聊天消息相同的背景)
      cardBorderClass: "border-blue-200/30 dark:border-blue-400/20",
      cardBgClass: "bg-blue-50 dark:bg-blue-950/60",
      pinnedCardBgClass:
        "bg-gradient-to-br from-blue-500/20 to-blue-50 dark:from-blue-400/20 dark:to-blue-950/60",
      pinnedCardBorderClass: "border-blue-500/40 dark:border-blue-400/40",
      // Tag colors
      tagBgClass: "bg-blue-100/60 dark:bg-blue-900/50",
      tagHoverBgClass: "hover:bg-blue-200/70 dark:hover:bg-blue-800/60",
      tagTextClass: "text-blue-700 dark:text-blue-300",
      // Glass panel colors
      glassPanelBg: "bg-blue-50/95 dark:bg-[#0b1a2e]/90",
      // Quote and badge colors
      quoteBgClass: "bg-black/5 dark:bg-white/10",
      badgeBgClass: "bg-blue-600/80 dark:bg-blue-700/80 backdrop-blur-sm",
      badgeTextClass: "text-white dark:text-blue-100",
      // Timeline colors
      timelineRingColor: "rgb(37, 99, 235)", // blue-600
      timelineRingColorDark: "rgb(59, 130, 246)", // blue-500
      // Graph colors
      graphNodeFill: "hsl(210, 65%, 58%)",
      graphNodeStroke: "hsl(210, 70%, 40%)",
      graphEdgeStroke: "hsl(210, 40%, 80%)",
      graphNodeFillDark: "hsl(210, 60%, 28%)",
      graphNodeStrokeDark: "hsl(210, 65%, 48%)",
      graphEdgeStrokeDark: "hsla(210, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(210, 85%, 78%)",
      graphNodeSelectedStroke: "hsl(210, 85%, 50%)",
      graphNodeCurrentFill: "rgba(59, 130, 246, 0.58)",
      graphNodeCurrentStroke: "rgb(59, 130, 246)",
      accentColor: gradient2AccentColor,
      accentSoftBg: gradient2AccentSoftBg,
      twoToneColor: gradient2AccentColor,
    },
    gradient3: {
      // Orange theme
      hoverClass: "hover:bg-orange-500/10 dark:hover:bg-orange-400/15",
      activeClass:
        "bg-orange-500/20 text-orange-700 dark:bg-orange-400/25 dark:text-orange-200 backdrop-blur-sm",
      hoverTextClass: "hover:text-orange-600 dark:hover:text-orange-400",
      borderClass: "border-orange-200/30 dark:border-orange-400/20",
      divideCalass: "bg-orange-200/30 dark:bg-orange-400/20",
      hoverBorderClass:
        "hover:border-orange-300/50 dark:hover:border-orange-400/30",
      focusBorderClass: "border-orange-500/60 dark:border-orange-400/50",
      focusRingClass:
        "focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(249,115,22,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(251,146,60,0.25)]",
      activeBorderClass: "border-orange-500/40 dark:border-orange-400/40",
      activeBadgeClass: "bg-orange-100/60 dark:bg-orange-900/40",
      activeBgClass:
        "bg-gradient-to-br from-orange-500/20 to-orange-50 dark:from-orange-400/20 dark:to-orange-950/60",
      iconBgClass:
        "bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/40 dark:to-orange-800/40",
      iconBgDeepClass:
        "bg-gradient-to-br from-orange-500 to-orange-600 dark:from-orange-600/80 dark:to-orange-700/80",
      iconTextClass: "text-orange-600 dark:text-orange-400",
      iconHoverClass:
        "group-hover:bg-orange-500/10 dark:group-hover:bg-orange-400/15",
      gradientClass:
        "bg-linear-to-r from-orange-500 via-orange-400 to-orange-500 dark:from-orange-600 dark:via-orange-500 dark:to-orange-600",
      primaryButtonClass:
        "bg-orange-600/80 dark:bg-orange-700/80 backdrop-blur-sm text-white dark:text-orange-100 hover:bg-orange-700/90 dark:hover:bg-orange-600/90",
      inputBgClass: "bg-orange-50/50 dark:bg-orange-950/30",
      // Chat background colors for orange theme
      chatMessageBg: "bg-orange-50 dark:bg-orange-950/60",
      chatInputBg: "bg-orange-50/80 dark:bg-orange-950/50",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-orange-100/60 dark:bg-orange-900/40",
      buttonBg: "bg-orange-600/80 dark:bg-orange-700/80 backdrop-blur-sm",
      buttonTextClass: "text-white dark:text-orange-100",
      // Text colors
      textClass: "text-gray-700 dark:text-gray-300",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-orange-700 dark:text-orange-200",
      // Card colors (使用与聊天消息相同的背景)
      cardBorderClass: "border-orange-200/30 dark:border-orange-400/20",
      cardBgClass: "bg-orange-50 dark:bg-orange-950/60",
      pinnedCardBgClass:
        "bg-gradient-to-br from-orange-500/20 to-orange-50 dark:from-orange-400/20 dark:to-orange-950/60",
      pinnedCardBorderClass: "border-orange-500/40 dark:border-orange-400/40",
      // Tag colors
      tagBgClass: "bg-orange-100/60 dark:bg-orange-900/50",
      tagHoverBgClass: "hover:bg-orange-200/70 dark:hover:bg-orange-800/60",
      tagTextClass: "text-orange-700 dark:text-orange-300",
      // Glass panel colors
      glassPanelBg: "bg-orange-50/95 dark:bg-[#2e1a0b]/90",
      // Quote and badge colors
      quoteBgClass: "bg-black/5 dark:bg-white/10",
      badgeBgClass: "bg-orange-600/80 dark:bg-orange-700/80 backdrop-blur-sm",
      badgeTextClass: "text-white dark:text-orange-100",
      // Timeline colors
      timelineRingColor: "rgb(249, 115, 22)", // orange-500 (adjusted for better visibility)
      timelineRingColorDark: "rgb(251, 146, 60)", // orange-400
      // Graph colors
      graphNodeFill: "hsl(25, 50%, 70%)",
      graphNodeStroke: "hsl(25, 50%, 50%)",
      graphEdgeStroke: "hsl(25, 40%, 80%)",
      graphNodeFillDark: "hsl(25, 50%, 20%)",
      graphNodeStrokeDark: "hsl(25, 50%, 40%)",
      graphEdgeStrokeDark: "hsla(25, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(25, 70%, 75%)",
      graphNodeSelectedStroke: "hsl(25, 70%, 55%)",
      graphNodeCurrentFill: "rgba(249, 115, 22, 0.58)",
      graphNodeCurrentStroke: "rgb(249, 115, 22)",
      accentColor: gradient3AccentColor,
      accentSoftBg: gradient3AccentSoftBg,
      twoToneColor: gradient3AccentColor,
    },
    gradient4: {
      // Green theme
      hoverClass: "hover:bg-green-500/10 dark:hover:bg-green-400/15",
      activeClass:
        "bg-green-500/20 text-green-700 dark:bg-green-400/25 dark:text-green-200 backdrop-blur-sm",
      hoverTextClass: "hover:text-green-600 dark:hover:text-green-400",
      borderClass: "border-green-200/30 dark:border-green-400/20",
      divideCalass: "bg-green-200/30 dark:bg-green-400/20",
      hoverBorderClass:
        "hover:border-green-300/50 dark:hover:border-green-400/30",
      focusBorderClass: "border-green-500/60 dark:border-green-400/50",
      focusRingClass:
        "focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(22,163,74,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(34,197,94,0.25)]",
      activeBorderClass: "border-green-500/40 dark:border-green-400/40",
      activeBadgeClass: "bg-green-100/60 dark:bg-green-900/40",
      activeBgClass:
        "bg-gradient-to-br from-green-500/20 to-green-50 dark:from-green-400/20 dark:to-green-950/60",
      iconBgClass:
        "bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/40 dark:to-green-800/40",
      iconBgDeepClass:
        "bg-gradient-to-br from-green-500 to-green-600 dark:from-green-600/80 dark:to-green-700/80",
      iconTextClass: "text-green-600 dark:text-green-400",
      iconHoverClass:
        "group-hover:bg-green-500/10 dark:group-hover:bg-green-400/15",
      gradientClass:
        "bg-linear-to-r from-green-500 via-green-400 to-green-500 dark:from-green-600 dark:via-green-500 dark:to-green-600",
      primaryButtonClass:
        "bg-green-600/80 dark:bg-green-700/80 backdrop-blur-sm text-white dark:text-green-100 hover:bg-green-700/90 dark:hover:bg-green-600/90",
      inputBgClass: "bg-green-50/50 dark:bg-green-950/30",
      // Chat background colors for green theme
      chatMessageBg: "bg-green-50 dark:bg-green-950/60",
      chatInputBg: "bg-green-50/80 dark:bg-green-950/50",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-green-100/60 dark:bg-green-900/40",
      buttonBg: "bg-green-600/80 dark:bg-green-700/80 backdrop-blur-sm",
      buttonTextClass: "text-white dark:text-green-100",
      // Text colors
      textClass: "text-gray-700 dark:text-gray-300",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-green-700 dark:text-green-200",
      // Card colors (使用与聊天消息相同的背景)
      cardBorderClass: "border-green-200/30 dark:border-green-400/20",
      cardBgClass: "bg-green-50 dark:bg-green-950/60",
      pinnedCardBgClass:
        "bg-gradient-to-br from-green-500/20 to-green-50 dark:from-green-400/20 dark:to-green-950/60",
      pinnedCardBorderClass: "border-green-500/40 dark:border-green-400/40",
      // Tag colors
      tagBgClass: "bg-green-100/60 dark:bg-green-900/50",
      tagHoverBgClass: "hover:bg-green-200/70 dark:hover:bg-green-800/60",
      tagTextClass: "text-green-700 dark:text-green-300",
      // Glass panel colors
      glassPanelBg: "bg-green-50/95 dark:bg-[#0b2e1a]/90",
      // Quote and badge colors
      quoteBgClass: "bg-black/5 dark:bg-white/10",
      badgeBgClass: "bg-green-600/80 dark:bg-green-700/80 backdrop-blur-sm",
      badgeTextClass: "text-white dark:text-green-100",
      // Timeline colors
      timelineRingColor: "rgb(22, 163, 74)", // green-600
      timelineRingColorDark: "rgb(34, 197, 94)", // green-500
      // Graph colors
      graphNodeFill: "hsl(142, 70%, 46%)",
      graphNodeStroke: "hsl(142, 75%, 30%)",
      graphEdgeStroke: "hsl(142, 38%, 78%)",
      graphNodeFillDark: "hsl(142, 55%, 22%)",
      graphNodeStrokeDark: "hsl(142, 65%, 42%)",
      graphEdgeStrokeDark: "hsla(142, 35%, 22%, 50%)",
      graphNodeSelectedFill: "hsl(142, 88%, 86%)",
      graphNodeSelectedStroke: "hsl(142, 86%, 50%)",
      graphNodeCurrentFill: "rgba(34, 197, 94, 0.58)",
      graphNodeCurrentStroke: "rgb(34, 197, 94)",
      accentColor: gradient4AccentColor,
      accentSoftBg: gradient4AccentSoftBg,
      twoToneColor: gradient4AccentColor,
    },
    gradient5: {
      // Pink theme
      hoverClass: "hover:bg-pink-500/10 dark:hover:bg-pink-400/15",
      activeClass:
        "bg-pink-500/20 text-pink-700 dark:bg-pink-400/25 dark:text-pink-200 backdrop-blur-sm",
      hoverTextClass: "hover:text-pink-600 dark:hover:text-pink-400",
      borderClass: "border-pink-200/30 dark:border-pink-400/20",
      divideCalass: "bg-pink-200/30 dark:bg-pink-400/20",
      hoverBorderClass:
        "hover:border-pink-300/50 dark:hover:border-pink-400/30",
      focusBorderClass: "border-pink-500/60 dark:border-pink-400/50",
      focusRingClass:
        "focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(219,39,119,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(236,72,153,0.25)]",
      activeBorderClass: "border-pink-500/40 dark:border-pink-400/40",
      activeBadgeClass: "bg-pink-100/60 dark:bg-pink-900/40",
      activeBgClass:
        "bg-gradient-to-br from-pink-500/20 to-pink-50 dark:from-pink-400/20 dark:to-pink-950/60",
      iconBgClass:
        "bg-gradient-to-br from-pink-100 to-pink-200 dark:from-pink-900/40 dark:to-pink-800/40",
      iconBgDeepClass:
        "bg-gradient-to-br from-pink-500 to-pink-600 dark:from-pink-600/80 dark:to-pink-700/80",
      iconTextClass: "text-pink-600 dark:text-pink-400",
      iconHoverClass:
        "group-hover:bg-pink-500/10 dark:group-hover:bg-pink-400/15",
      gradientClass:
        "bg-linear-to-r from-pink-500 via-pink-400 to-pink-500 dark:from-pink-600 dark:via-pink-500 dark:to-pink-600",
      primaryButtonClass:
        "bg-pink-600/80 dark:bg-pink-700/80 backdrop-blur-sm text-white dark:text-pink-100 hover:bg-pink-700/90 dark:hover:bg-pink-600/90",
      inputBgClass: "bg-pink-50/50 dark:bg-pink-950/30",
      // Chat background colors for pink theme
      chatMessageBg: "bg-pink-50 dark:bg-pink-950/60",
      chatInputBg: "bg-pink-50/80 dark:bg-pink-950/50",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-pink-100/60 dark:bg-pink-900/40",
      buttonBg: "bg-pink-600/80 dark:bg-pink-700/80 backdrop-blur-sm",
      buttonTextClass: "text-white dark:text-pink-100",
      // Text colors
      textClass: "text-gray-700 dark:text-gray-300",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-pink-700 dark:text-pink-200",
      // Card colors (使用与聊天消息相同的背景)
      cardBorderClass: "border-pink-200/30 dark:border-pink-400/20",
      cardBgClass: "bg-pink-50 dark:bg-pink-950/60",
      pinnedCardBgClass:
        "bg-gradient-to-br from-pink-500/20 to-pink-50 dark:from-pink-400/20 dark:to-pink-950/60",
      pinnedCardBorderClass: "border-pink-500/40 dark:border-pink-400/40",
      // Tag colors
      tagBgClass: "bg-pink-100/60 dark:bg-pink-900/50",
      tagHoverBgClass: "hover:bg-pink-200/70 dark:hover:bg-pink-800/60",
      tagTextClass: "text-pink-700 dark:text-pink-300",
      // Glass panel colors
      glassPanelBg: "bg-pink-50/95 dark:bg-[#2e0b1a]/90",
      // Quote and badge colors
      quoteBgClass: "bg-black/5 dark:bg-white/10",
      badgeBgClass: "bg-pink-600/80 dark:bg-pink-700/80 backdrop-blur-sm",
      badgeTextClass: "text-white dark:text-pink-100",
      // Timeline colors
      timelineRingColor: "rgb(219, 39, 119)", // pink-600
      timelineRingColorDark: "rgb(236, 72, 153)", // pink-500
      // Graph colors
      graphNodeFill: "hsl(330, 68%, 60%)",
      graphNodeStroke: "hsl(330, 70%, 42%)",
      graphEdgeStroke: "hsl(330, 40%, 80%)",
      graphNodeFillDark: "hsl(330, 58%, 28%)",
      graphNodeStrokeDark: "hsl(330, 65%, 48%)",
      graphEdgeStrokeDark: "hsla(330, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(330, 88%, 82%)",
      graphNodeSelectedStroke: "hsl(330, 85%, 55%)",
      graphNodeCurrentFill: "rgba(236, 72, 153, 0.58)",
      graphNodeCurrentStroke: "rgb(236, 72, 153)",
      accentColor: gradient5AccentColor,
      accentSoftBg: gradient5AccentSoftBg,
      twoToneColor: gradient5AccentColor,
    },
    gradient6: {
      // Gray theme
      hoverClass: "hover:bg-gray-500/10 dark:hover:bg-gray-400/15",
      activeClass:
        "bg-gray-500/20 text-gray-700 dark:bg-gray-400/25 dark:text-gray-200 backdrop-blur-sm",
      hoverTextClass: "hover:text-gray-600 dark:hover:text-gray-400",
      borderClass: "border-gray-200/30 dark:border-gray-400/20",
      divideCalass: "bg-gray-200/30 dark:bg-gray-400/20",
      hoverBorderClass:
        "hover:border-gray-300/50 dark:hover:border-gray-400/30",
      focusBorderClass: "border-gray-500/60 dark:border-gray-400/50",
      focusRingClass:
        "focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(75,85,99,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(107,114,128,0.25)]",
      activeBorderClass: "border-gray-500/40 dark:border-gray-400/40",
      activeBadgeClass: "bg-gray-100/60 dark:bg-zinc-700/40",
      activeBgClass:
        "bg-gradient-to-br from-gray-500/20 to-gray-50 dark:from-gray-400/20 dark:to-gray-800/60",
      iconBgClass:
        "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700/40 dark:to-gray-600/40",
      iconBgDeepClass:
        "bg-gradient-to-br from-gray-500 to-gray-600 dark:from-gray-600/80 dark:to-gray-700/80",
      iconTextClass: "text-gray-600 dark:text-gray-400",
      iconHoverClass:
        "group-hover:bg-gray-500/10 dark:group-hover:bg-gray-400/15",
      gradientClass:
        "bg-linear-to-r from-gray-500 via-gray-400 to-gray-500 dark:from-gray-600 dark:via-gray-500 dark:to-gray-600",
      primaryButtonClass:
        "bg-gray-600/80 dark:bg-zinc-700/80 backdrop-blur-sm text-white dark:text-gray-100 hover:bg-zinc-700/90 dark:hover:bg-gray-600/90",
      inputBgClass: "bg-gray-50/50 dark:bg-zinc-800/30",
      // Chat background colors for gray theme
      chatMessageBg: "bg-gray-50 dark:bg-zinc-800/60",
      chatInputBg: "bg-gray-50/80 dark:bg-zinc-800/50",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-gray-100/60 dark:bg-zinc-700/40",
      buttonBg: "bg-gray-600/80 dark:bg-zinc-700/80 backdrop-blur-sm",
      buttonTextClass: "text-white dark:text-gray-100",
      // Text colors
      textClass: "text-gray-700 dark:text-gray-300",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-gray-700 dark:text-gray-200",
      // Card colors (使用与聊天消息相同的背景)
      cardBorderClass: "border-gray-200/30 dark:border-gray-400/20",
      cardBgClass: "bg-gray-50 dark:bg-zinc-800/60",
      pinnedCardBgClass:
        "bg-gradient-to-br from-gray-500/20 to-gray-50 dark:from-gray-400/20 dark:to-gray-800/60",
      pinnedCardBorderClass: "border-gray-500/40 dark:border-gray-400/40",
      // Tag colors
      tagBgClass: "bg-gray-100/60 dark:bg-zinc-700/50",
      tagHoverBgClass: "hover:bg-gray-200/70 dark:hover:bg-gray-600/60",
      tagTextClass: "text-gray-700 dark:text-gray-300",
      // Glass panel colors
      glassPanelBg: "bg-gray-50/95 dark:bg-[#1a1a1a]/90",
      // Quote and badge colors
      quoteBgClass: "bg-black/5 dark:bg-white/10",
      badgeBgClass: "bg-gray-600/80 dark:bg-zinc-700/80 backdrop-blur-sm",
      badgeTextClass: "text-white dark:text-gray-100",
      // Timeline colors
      timelineRingColor: "rgb(75, 85, 99)", // gray-600
      timelineRingColorDark: "rgb(107, 114, 128)", // gray-500
      // Graph colors
      graphNodeFill: "hsl(210, 10%, 48%)",
      graphNodeStroke: "hsl(210, 12%, 26%)",
      graphEdgeStroke: "hsl(0, 0%, 80%)",
      graphNodeFillDark: "hsl(210, 10%, 16%)",
      graphNodeStrokeDark: "hsl(210, 12%, 34%)",
      graphEdgeStrokeDark: "hsla(0, 0%, 22%, 60%)",
      graphNodeSelectedFill: isDarkMode
        ? "hsl(210, 16%, 70%)"
        : "hsl(210, 22%, 94%)",
      graphNodeSelectedStroke: isDarkMode
        ? "hsl(210, 20%, 50%)"
        : "hsl(210, 26%, 60%)",
      graphNodeCurrentFill: "rgba(107, 114, 128, 0.58)",
      graphNodeCurrentStroke: "rgb(107, 114, 128)",
      accentColor: gradient6AccentColor,
      accentSoftBg: gradient6AccentSoftBg,
      twoToneColor: gradient6AccentColor,
    },
    gradient7: {
      // Cyan/Teal theme
      hoverClass: "hover:bg-cyan-500/10 dark:hover:bg-cyan-400/15",
      activeClass:
        "bg-cyan-500/20 text-cyan-700 dark:bg-cyan-400/25 dark:text-cyan-200 backdrop-blur-sm",
      hoverTextClass: "hover:text-cyan-600 dark:hover:text-cyan-400",
      borderClass: "border-cyan-200/30 dark:border-cyan-400/20",
      divideCalass: "bg-cyan-200/30 dark:bg-cyan-400/20",
      hoverBorderClass:
        "hover:border-cyan-300/50 dark:hover:border-cyan-400/30",
      focusBorderClass: "border-cyan-500/60 dark:border-cyan-400/50",
      focusRingClass:
        "focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(6,182,212,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(34,211,238,0.25)]",
      activeBorderClass: "border-cyan-500/40 dark:border-cyan-400/40",
      activeBadgeClass: "bg-cyan-100/60 dark:bg-cyan-900/40",
      activeBgClass:
        "bg-gradient-to-br from-cyan-500/20 to-cyan-50 dark:from-cyan-400/20 dark:to-cyan-950/60",
      iconBgClass:
        "bg-gradient-to-br from-cyan-100 to-cyan-200 dark:from-cyan-900/40 dark:to-cyan-800/40",
      iconBgDeepClass:
        "bg-gradient-to-br from-cyan-500 to-cyan-600 dark:from-cyan-600/80 dark:to-cyan-700/80",
      iconTextClass: "text-cyan-600 dark:text-cyan-400",
      iconHoverClass:
        "group-hover:bg-cyan-500/10 dark:group-hover:bg-cyan-400/15",
      gradientClass:
        "bg-linear-to-r from-cyan-500 via-cyan-400 to-cyan-500 dark:from-cyan-600 dark:via-cyan-500 dark:to-cyan-600",
      primaryButtonClass:
        "bg-cyan-600/80 dark:bg-cyan-700/80 backdrop-blur-sm text-white dark:text-cyan-100 hover:bg-cyan-700/90 dark:hover:bg-cyan-600/90",
      inputBgClass: "bg-cyan-50/50 dark:bg-cyan-950/30",
      // Chat background colors for cyan theme
      chatMessageBg: "bg-cyan-50 dark:bg-cyan-950/60",
      chatInputBg: "bg-cyan-50/80 dark:bg-cyan-950/50",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-cyan-100/60 dark:bg-cyan-900/40",
      buttonBg: "bg-cyan-600/80 dark:bg-cyan-700/80 backdrop-blur-sm",
      buttonTextClass: "text-white dark:text-cyan-100",
      // Text colors
      textClass: "text-gray-700 dark:text-gray-300",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-cyan-700 dark:text-cyan-200",
      // Card colors
      cardBorderClass: "border-cyan-200/30 dark:border-cyan-400/20",
      cardBgClass: "bg-cyan-50 dark:bg-cyan-950/60",
      pinnedCardBgClass:
        "bg-gradient-to-br from-cyan-500/20 to-cyan-50 dark:from-cyan-400/20 dark:to-cyan-950/60",
      pinnedCardBorderClass: "border-cyan-500/40 dark:border-cyan-400/40",
      // Tag colors
      tagBgClass: "bg-cyan-100/60 dark:bg-cyan-900/50",
      tagHoverBgClass: "hover:bg-cyan-200/70 dark:hover:bg-cyan-800/60",
      tagTextClass: "text-cyan-700 dark:text-cyan-300",
      // Glass panel colors
      glassPanelBg: "bg-cyan-50/95 dark:bg-[#0b2e2e]/90",
      // Quote and badge colors
      quoteBgClass: "bg-black/5 dark:bg-white/10",
      badgeBgClass: "bg-cyan-600/80 dark:bg-cyan-700/80 backdrop-blur-sm",
      badgeTextClass: "text-white dark:text-cyan-100",
      // Timeline colors
      timelineRingColor: "rgb(6, 182, 212)", // cyan-500
      timelineRingColorDark: "rgb(34, 211, 238)", // cyan-400
      // Graph colors
      graphNodeFill: "hsl(185, 70%, 50%)",
      graphNodeStroke: "hsl(185, 75%, 35%)",
      graphEdgeStroke: "hsl(185, 40%, 80%)",
      graphNodeFillDark: "hsl(185, 60%, 25%)",
      graphNodeStrokeDark: "hsl(185, 65%, 45%)",
      graphEdgeStrokeDark: "hsla(185, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(185, 85%, 80%)",
      graphNodeSelectedStroke: "hsl(185, 85%, 55%)",
      graphNodeCurrentFill: "rgba(34, 211, 238, 0.58)",
      graphNodeCurrentStroke: "rgb(34, 211, 238)",
      accentColor: gradient7AccentColor,
      accentSoftBg: gradient7AccentSoftBg,
      twoToneColor: gradient7AccentColor,
    },
    gradient8: {
      // Amber/Gold theme
      hoverClass: "hover:bg-amber-500/10 dark:hover:bg-amber-400/15",
      activeClass:
        "bg-amber-500/20 text-amber-700 dark:bg-amber-400/25 dark:text-amber-200 backdrop-blur-sm",
      hoverTextClass: "hover:text-amber-600 dark:hover:text-amber-400",
      borderClass: "border-amber-200/30 dark:border-amber-400/20",
      divideCalass: "bg-amber-200/30 dark:bg-amber-400/20",
      hoverBorderClass:
        "hover:border-amber-300/50 dark:hover:border-amber-400/30",
      focusBorderClass: "border-amber-500/60 dark:border-amber-400/50",
      focusRingClass:
        "focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(245,158,11,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(251,191,36,0.25)]",
      activeBorderClass: "border-amber-500/40 dark:border-amber-400/40",
      activeBadgeClass: "bg-amber-100/60 dark:bg-amber-900/40",
      activeBgClass:
        "bg-gradient-to-br from-amber-500/20 to-amber-50 dark:from-amber-400/20 dark:to-amber-950/60",
      iconBgClass:
        "bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/40",
      iconBgDeepClass:
        "bg-gradient-to-br from-amber-500 to-amber-600 dark:from-amber-600/80 dark:to-amber-700/80",
      iconTextClass: "text-amber-600 dark:text-amber-400",
      iconHoverClass:
        "group-hover:bg-amber-500/10 dark:group-hover:bg-amber-400/15",
      gradientClass:
        "bg-linear-to-r from-amber-500 via-amber-400 to-amber-500 dark:from-amber-600 dark:via-amber-500 dark:to-amber-600",
      primaryButtonClass:
        "bg-amber-600/80 dark:bg-amber-700/80 backdrop-blur-sm text-white dark:text-amber-100 hover:bg-amber-700/90 dark:hover:bg-amber-600/90",
      inputBgClass: "bg-amber-50/50 dark:bg-amber-950/30",
      // Chat background colors for amber theme
      chatMessageBg: "bg-amber-50 dark:bg-amber-950/60",
      chatInputBg: "bg-amber-50/80 dark:bg-amber-950/50",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-amber-100/60 dark:bg-amber-900/40",
      buttonBg: "bg-amber-600/80 dark:bg-amber-700/80 backdrop-blur-sm",
      buttonTextClass: "text-white dark:text-amber-100",
      // Text colors
      textClass: "text-gray-700 dark:text-gray-300",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-amber-700 dark:text-amber-200",
      // Card colors
      cardBorderClass: "border-amber-200/30 dark:border-amber-400/20",
      cardBgClass: "bg-amber-50 dark:bg-amber-950/60",
      pinnedCardBgClass:
        "bg-gradient-to-br from-amber-500/20 to-amber-50 dark:from-amber-400/20 dark:to-amber-950/60",
      pinnedCardBorderClass: "border-amber-500/40 dark:border-amber-400/40",
      // Tag colors
      tagBgClass: "bg-amber-100/60 dark:bg-amber-900/50",
      tagHoverBgClass: "hover:bg-amber-200/70 dark:hover:bg-amber-800/60",
      tagTextClass: "text-amber-700 dark:text-amber-300",
      // Glass panel colors
      glassPanelBg: "bg-amber-50/95 dark:bg-[#2e2810]/90",
      // Quote and badge colors
      quoteBgClass: "bg-black/5 dark:bg-white/10",
      badgeBgClass: "bg-amber-600/80 dark:bg-amber-700/80 backdrop-blur-sm",
      badgeTextClass: "text-white dark:text-amber-100",
      // Timeline colors
      timelineRingColor: "rgb(245, 158, 11)", // amber-500
      timelineRingColorDark: "rgb(251, 191, 36)", // amber-400
      // Graph colors
      graphNodeFill: "hsl(38, 90%, 55%)",
      graphNodeStroke: "hsl(38, 95%, 40%)",
      graphEdgeStroke: "hsl(38, 40%, 80%)",
      graphNodeFillDark: "hsl(38, 70%, 25%)",
      graphNodeStrokeDark: "hsl(38, 80%, 45%)",
      graphEdgeStrokeDark: "hsla(38, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(38, 90%, 82%)",
      graphNodeSelectedStroke: "hsl(38, 90%, 55%)",
      graphNodeCurrentFill: "rgba(251, 191, 36, 0.58)",
      graphNodeCurrentStroke: "rgb(251, 191, 36)",
      accentColor: gradient8AccentColor,
      accentSoftBg: gradient8AccentSoftBg,
      twoToneColor: gradient8AccentColor,
    },
    gradient9: {
      // Red theme
      hoverClass: "hover:bg-red-500/10 dark:hover:bg-red-400/15",
      activeClass:
        "bg-red-500/20 text-red-700 dark:bg-red-400/25 dark:text-red-200 backdrop-blur-sm",
      hoverTextClass: "hover:text-red-600 dark:hover:text-red-400",
      borderClass: "border-red-200/30 dark:border-red-400/20",
      divideCalass: "bg-red-200/30 dark:bg-red-400/20",
      hoverBorderClass: "hover:border-red-300/50 dark:hover:border-red-400/30",
      focusBorderClass: "border-red-500/60 dark:border-red-400/50",
      focusRingClass:
        "focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(239,68,68,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(248,113,113,0.25)]",
      activeBorderClass: "border-red-500/40 dark:border-red-400/40",
      activeBadgeClass: "bg-red-100/60 dark:bg-red-900/40",
      activeBgClass:
        "bg-gradient-to-br from-red-500/20 to-red-50 dark:from-red-400/20 dark:to-red-950/60",
      iconBgClass:
        "bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/40 dark:to-red-800/40",
      iconBgDeepClass:
        "bg-gradient-to-br from-red-500 to-red-600 dark:from-red-600/80 dark:to-red-700/80",
      iconTextClass: "text-red-600 dark:text-red-400",
      iconHoverClass:
        "group-hover:bg-red-500/10 dark:group-hover:bg-red-400/15",
      gradientClass:
        "bg-linear-to-r from-red-500 via-red-400 to-red-500 dark:from-red-600 dark:via-red-500 dark:to-red-600",
      primaryButtonClass:
        "bg-red-600/80 dark:bg-red-700/80 backdrop-blur-sm text-white dark:text-red-100 hover:bg-red-700/90 dark:hover:bg-red-600/90",
      inputBgClass: "bg-red-50/50 dark:bg-red-950/30",
      // Chat background colors for red theme
      chatMessageBg: "bg-red-50 dark:bg-red-950/60",
      chatInputBg: "bg-red-50/80 dark:bg-red-950/50",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-red-100/60 dark:bg-red-900/40",
      buttonBg: "bg-red-600/80 dark:bg-red-700/80 backdrop-blur-sm",
      buttonTextClass: "text-white dark:text-red-100",
      // Text colors
      textClass: "text-gray-700 dark:text-gray-300",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-red-700 dark:text-red-200",
      // Card colors
      cardBorderClass: "border-red-200/30 dark:border-red-400/20",
      cardBgClass: "bg-red-50 dark:bg-red-950/60",
      pinnedCardBgClass:
        "bg-gradient-to-br from-red-500/20 to-red-50 dark:from-red-400/20 dark:to-red-950/60",
      pinnedCardBorderClass: "border-red-500/40 dark:border-red-400/40",
      // Tag colors
      tagBgClass: "bg-red-100/60 dark:bg-red-900/50",
      tagHoverBgClass: "hover:bg-red-200/70 dark:hover:bg-red-800/60",
      tagTextClass: "text-red-700 dark:text-red-300",
      // Glass panel colors
      glassPanelBg: "bg-red-50/95 dark:bg-[#2e1515]/90",
      // Quote and badge colors
      quoteBgClass: "bg-black/5 dark:bg-white/10",
      badgeBgClass: "bg-red-600/80 dark:bg-red-700/80 backdrop-blur-sm",
      badgeTextClass: "text-white dark:text-red-100",
      // Timeline colors
      timelineRingColor: "rgb(239, 68, 68)", // red-500
      timelineRingColorDark: "rgb(248, 113, 113)", // red-400
      // Graph colors
      graphNodeFill: "hsl(0, 70%, 58%)",
      graphNodeStroke: "hsl(0, 75%, 40%)",
      graphEdgeStroke: "hsl(0, 40%, 80%)",
      graphNodeFillDark: "hsl(0, 60%, 28%)",
      graphNodeStrokeDark: "hsl(0, 65%, 48%)",
      graphEdgeStrokeDark: "hsla(0, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(0, 85%, 82%)",
      graphNodeSelectedStroke: "hsl(0, 85%, 55%)",
      graphNodeCurrentFill: "rgba(248, 113, 113, 0.58)",
      graphNodeCurrentStroke: "rgb(248, 113, 113)",
      accentColor: gradient9AccentColor,
      accentSoftBg: gradient9AccentSoftBg,
      twoToneColor: gradient9AccentColor,
    },
  };

  return (
    themeColors[backgroundType as keyof typeof themeColors] ||
    themeColors.gradient1
  );
};

export default useThemeColors;
