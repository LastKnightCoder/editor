import useBackgroundMode from "./useBackgroundMode";

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
 */
const useThemeColors = () => {
  const { backgroundType, isSolid } = useBackgroundMode();

  // For solid mode, use modern monochrome/grayscale theme
  if (isSolid) {
    return {
      hoverClass: "hover:bg-gray-100 dark:hover:bg-gray-800",
      activeClass:
        "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
      hoverTextClass: "hover:text-gray-900 dark:hover:text-gray-100",
      borderClass: "border-[#f0f0f0] dark:border-[#2a2a2a]",
      divideCalass: "bg-[#f0f0f0] dark:bg-[#2a2a2a]",
      hoverBorderClass: "hover:border-[#eaeaea] dark:hover:border-[#3a3a3a]",
      focusBorderClass: "border-[#6b6b6b] dark:border-[#9a9a9a]",
      // Chat background colors for solid mode
      chatMessageBg: "bg-gray-50/80 dark:bg-gray-900/50",
      chatInputBg:
        "bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-gray-100 dark:bg-gray-800",
      buttonBg: "bg-gray-900 dark:bg-gray-100",
      buttonTextClass: "text-white dark:text-gray-900",
      // Text colors
      textClass: "text-gray-600 dark:text-gray-400",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-gray-900 dark:text-gray-100",
      // Card colors
      cardBorderClass: "border-gray-200 dark:border-gray-800",
      cardBgClass: "bg-gray-50/80 dark:bg-gray-900/50",
      pinnedCardBgClass:
        "bg-gradient-to-br from-gray-200/50 to-gray-50/80 dark:from-gray-800/50 dark:to-gray-900/50",
      pinnedCardBorderClass: "border-gray-300 dark:border-gray-700",
      // Tag colors
      tagBgClass: "bg-gray-100 dark:bg-gray-800",
      tagHoverBgClass: "hover:bg-gray-200 dark:hover:bg-gray-700",
      tagTextClass: "text-gray-700 dark:text-gray-300",
      // Glass panel colors
      glassPanelBg: "bg-white/95 dark:bg-black/90",
      // Quote and badge colors
      quoteBgClass: "bg-gray-100 dark:bg-gray-800",
      badgeBgClass: "bg-blue-500",
      badgeTextClass: "text-white",
      // Timeline colors
      timelineRingColor: "rgb(107, 114, 128)", // gray-500
      timelineRingColorDark: "rgb(156, 163, 175)", // gray-400
      // Graph colors (Grayscale)
      graphNodeFill: "hsl(0, 0%, 70%)",
      graphNodeStroke: "hsl(0, 0%, 50%)",
      graphEdgeStroke: "hsl(0, 0%, 80%)",
      graphNodeFillDark: "hsl(0, 0%, 20%)",
      graphNodeStrokeDark: "hsl(0, 0%, 40%)",
      graphEdgeStrokeDark: "hsla(0, 0%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(0, 0%, 75%)",
      graphNodeSelectedStroke: "hsl(0, 0%, 55%)",
      graphNodeCurrentFill: "rgba(107, 114, 128, 0.58)",
      graphNodeCurrentStroke: "rgb(107, 114, 128)",
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
      graphNodeFill: "hsl(280, 50%, 70%)",
      graphNodeStroke: "hsl(280, 50%, 50%)",
      graphEdgeStroke: "hsl(280, 40%, 80%)",
      graphNodeFillDark: "hsl(280, 50%, 20%)",
      graphNodeStrokeDark: "hsl(280, 50%, 40%)",
      graphEdgeStrokeDark: "hsla(280, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(280, 70%, 75%)",
      graphNodeSelectedStroke: "hsl(280, 70%, 55%)",
      graphNodeCurrentFill: "rgba(168, 85, 247, 0.58)",
      graphNodeCurrentStroke: "rgb(168, 85, 247)",
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
      graphNodeFill: "hsl(210, 50%, 70%)",
      graphNodeStroke: "hsl(210, 50%, 50%)",
      graphEdgeStroke: "hsl(210, 40%, 80%)",
      graphNodeFillDark: "hsl(210, 50%, 20%)",
      graphNodeStrokeDark: "hsl(210, 50%, 40%)",
      graphEdgeStrokeDark: "hsla(210, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(210, 70%, 75%)",
      graphNodeSelectedStroke: "hsl(210, 70%, 55%)",
      graphNodeCurrentFill: "rgba(59, 130, 246, 0.58)",
      graphNodeCurrentStroke: "rgb(59, 130, 246)",
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
      graphNodeFill: "hsl(142, 50%, 70%)",
      graphNodeStroke: "hsl(142, 50%, 50%)",
      graphEdgeStroke: "hsl(142, 40%, 80%)",
      graphNodeFillDark: "hsl(142, 50%, 20%)",
      graphNodeStrokeDark: "hsl(142, 50%, 40%)",
      graphEdgeStrokeDark: "hsla(142, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(142, 70%, 75%)",
      graphNodeSelectedStroke: "hsl(142, 70%, 55%)",
      graphNodeCurrentFill: "rgba(34, 197, 94, 0.58)",
      graphNodeCurrentStroke: "rgb(34, 197, 94)",
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
      graphNodeFill: "hsl(330, 50%, 70%)",
      graphNodeStroke: "hsl(330, 50%, 50%)",
      graphEdgeStroke: "hsl(330, 40%, 80%)",
      graphNodeFillDark: "hsl(330, 50%, 20%)",
      graphNodeStrokeDark: "hsl(330, 50%, 40%)",
      graphEdgeStrokeDark: "hsla(330, 40%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(330, 70%, 75%)",
      graphNodeSelectedStroke: "hsl(330, 70%, 55%)",
      graphNodeCurrentFill: "rgba(236, 72, 153, 0.58)",
      graphNodeCurrentStroke: "rgb(236, 72, 153)",
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
      // Chat background colors for gray theme
      chatMessageBg: "bg-gray-50 dark:bg-gray-800/60",
      chatInputBg: "bg-gray-50/80 dark:bg-gray-800/50",
      chatContainerBg: "bg-white/95 dark:bg-[#0a0a0a]/95",
      // Tag count and button colors
      tagCountBg: "bg-gray-100/60 dark:bg-gray-700/40",
      buttonBg: "bg-gray-600/80 dark:bg-gray-700/80 backdrop-blur-sm",
      buttonTextClass: "text-white dark:text-gray-100",
      // Text colors
      textClass: "text-gray-700 dark:text-gray-300",
      secondaryTextClass: "text-gray-400 dark:text-gray-500",
      activeTextClass: "text-gray-700 dark:text-gray-200",
      // Card colors (使用与聊天消息相同的背景)
      cardBorderClass: "border-gray-200/30 dark:border-gray-400/20",
      cardBgClass: "bg-gray-50 dark:bg-gray-800/60",
      pinnedCardBgClass:
        "bg-gradient-to-br from-gray-500/20 to-gray-50 dark:from-gray-400/20 dark:to-gray-800/60",
      pinnedCardBorderClass: "border-gray-500/40 dark:border-gray-400/40",
      // Tag colors
      tagBgClass: "bg-gray-100/60 dark:bg-gray-700/50",
      tagHoverBgClass: "hover:bg-gray-200/70 dark:hover:bg-gray-600/60",
      tagTextClass: "text-gray-700 dark:text-gray-300",
      // Glass panel colors
      glassPanelBg: "bg-gray-50/95 dark:bg-[#1a1a1a]/90",
      // Quote and badge colors
      quoteBgClass: "bg-black/5 dark:bg-white/10",
      badgeBgClass: "bg-gray-600/80 dark:bg-gray-700/80 backdrop-blur-sm",
      badgeTextClass: "text-white dark:text-gray-100",
      // Timeline colors
      timelineRingColor: "rgb(75, 85, 99)", // gray-600
      timelineRingColorDark: "rgb(107, 114, 128)", // gray-500
      // Graph colors
      graphNodeFill: "hsl(0, 0%, 70%)",
      graphNodeStroke: "hsl(0, 0%, 50%)",
      graphEdgeStroke: "hsl(0, 0%, 80%)",
      graphNodeFillDark: "hsl(0, 0%, 20%)",
      graphNodeStrokeDark: "hsl(0, 0%, 40%)",
      graphEdgeStrokeDark: "hsla(0, 0%, 20%, 50%)",
      graphNodeSelectedFill: "hsl(0, 0%, 75%)",
      graphNodeSelectedStroke: "hsl(0, 0%, 55%)",
      graphNodeCurrentFill: "rgba(107, 114, 128, 0.58)",
      graphNodeCurrentStroke: "rgb(107, 114, 128)",
    },
  };

  return (
    themeColors[backgroundType as keyof typeof themeColors] ||
    themeColors.gradient1
  );
};

export default useThemeColors;
