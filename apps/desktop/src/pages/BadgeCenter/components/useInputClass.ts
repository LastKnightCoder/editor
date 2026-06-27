import useThemeColors from "@/hooks/useThemeColors";

export const useBadgeInputClass = () => {
  const themeColors = useThemeColors();
  return `w-full rounded-2xl px-4 py-3 text-sm focus:outline-none border ${themeColors.inputBgClass} ${themeColors.borderClass} ${themeColors.activeTextClass} ${themeColors.focusRingClass} transition ${themeColors.hoverBorderClass}`;
};

export const useBadgeSelectClass = () => {
  const themeColors = useThemeColors();
  return `w-full cursor-pointer rounded-2xl px-4 py-3 text-sm focus:outline-none border ${themeColors.inputBgClass} ${themeColors.borderClass} ${themeColors.activeTextClass} ${themeColors.focusRingClass} transition ${themeColors.hoverBorderClass}`;
};
