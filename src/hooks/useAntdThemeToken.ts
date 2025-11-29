import useSettingStore from "@/stores/useSettingStore";
import useTheme from "./useTheme";

type ThemeColors = {
  colorPrimary: string;
  colorPrimaryHover: string;
  colorPrimaryActive: string;
  colorLink: string;
};

type OverlayColors = {
  background: string;
  hoverBackground: string;
  activeBackground: string;
  borderColor: string;
  textColor: string;
  secondaryTextColor: string;
  shadow: string;
  dropdownShadow: string;
};

type OverlayPalette = {
  light: OverlayColors;
  dark: OverlayColors;
};

const lightTextColor = "#1f1f1f";
const darkTextColor = "#f5f5f5";
const lightSecondaryTextColor = "#666666";
const darkSecondaryTextColor = "#bfbfbf";

const createOverlayPalette = (config: {
  lightBg: string;
  darkBg: string;
  lightHoverBg: string;
  darkHoverBg: string;
  lightActiveBg: string;
  darkActiveBg: string;
  lightBorderColor: string;
  darkBorderColor: string;
  lightShadow: string;
  darkShadow: string;
  lightDropdownShadow?: string;
  darkDropdownShadow?: string;
}): OverlayPalette => ({
  light: {
    background: config.lightBg,
    hoverBackground: config.lightHoverBg,
    activeBackground: config.lightActiveBg,
    borderColor: config.lightBorderColor,
    textColor: lightTextColor,
    secondaryTextColor: lightSecondaryTextColor,
    shadow: config.lightShadow,
    dropdownShadow: config.lightDropdownShadow || config.lightShadow,
  },
  dark: {
    background: config.darkBg,
    hoverBackground: config.darkHoverBg,
    activeBackground: config.darkActiveBg,
    borderColor: config.darkBorderColor,
    textColor: darkTextColor,
    secondaryTextColor: darkSecondaryTextColor,
    shadow: config.darkShadow,
    dropdownShadow: config.darkDropdownShadow || config.darkShadow,
  },
});

const themeTokenMap: Record<string, ThemeColors> = {
  solid: {
    colorPrimary: "#6b7280", // gray-500
    colorPrimaryHover: "#4b5563", // gray-600
    colorPrimaryActive: "#374151", // gray-700
    colorLink: "#6b7280",
  },
  gradient1: {
    // Purple theme
    colorPrimary: "#9333ea", // purple-600
    colorPrimaryHover: "#a855f7", // purple-500
    colorPrimaryActive: "#7c3aed", // purple-600 darker
    colorLink: "#9333ea",
  },
  gradient2: {
    // Blue theme
    colorPrimary: "#2563eb", // blue-600
    colorPrimaryHover: "#3b82f6", // blue-500
    colorPrimaryActive: "#1d4ed8", // blue-700
    colorLink: "#2563eb",
  },
  gradient3: {
    // Orange theme
    colorPrimary: "#ea580c", // orange-600
    colorPrimaryHover: "#f97316", // orange-500
    colorPrimaryActive: "#c2410c", // orange-700
    colorLink: "#ea580c",
  },
  gradient4: {
    // Green theme
    colorPrimary: "#16a34a", // green-600
    colorPrimaryHover: "#22c55e", // green-500
    colorPrimaryActive: "#15803d", // green-700
    colorLink: "#16a34a",
  },
  gradient5: {
    // Pink theme
    colorPrimary: "#db2777", // pink-600
    colorPrimaryHover: "#ec4899", // pink-500
    colorPrimaryActive: "#be185d", // pink-700
    colorLink: "#db2777",
  },
  gradient6: {
    // Gray theme
    colorPrimary: "#4b5563", // gray-600
    colorPrimaryHover: "#6b7280", // gray-500
    colorPrimaryActive: "#374151", // gray-700
    colorLink: "#4b5563",
  },
};

const overlayTokenMap: Record<string, OverlayPalette> = {
  solid: createOverlayPalette({
    lightBg: "#ffffff",
    darkBg: "#1f1f1f",
    lightHoverBg: "#f5f5f5",
    darkHoverBg: "#262626",
    lightActiveBg: "#ededed",
    darkActiveBg: "#333333",
    lightBorderColor: "#e5e5e5",
    darkBorderColor: "#2a2a2a",
    lightShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
    darkShadow: "0 25px 60px rgba(0, 0, 0, 0.75)",
    lightDropdownShadow: "0 6px 14px rgba(15, 23, 42, 0.12)",
    darkDropdownShadow: "0 10px 22px rgba(0, 0, 0, 0.58)",
  }),
  gradient1: createOverlayPalette({
    lightBg: "rgba(250, 245, 255, 0.95)",
    darkBg: "rgba(26, 11, 46, 0.9)",
    lightHoverBg: "rgba(147, 51, 234, 0.08)",
    darkHoverBg: "rgba(168, 85, 247, 0.25)",
    lightActiveBg: "rgba(147, 51, 234, 0.18)",
    darkActiveBg: "rgba(168, 85, 247, 0.4)",
    lightBorderColor: "rgba(167, 139, 250, 0.45)",
    darkBorderColor: "rgba(168, 85, 247, 0.45)",
    lightShadow: "0 25px 60px rgba(147, 51, 234, 0.25)",
    darkShadow: "0 30px 70px rgba(7, 3, 14, 0.85)",
    lightDropdownShadow: "0 8px 18px rgba(147, 51, 234, 0.15)",
    darkDropdownShadow: "0 14px 28px rgba(7, 3, 14, 0.65)",
  }),
  gradient2: createOverlayPalette({
    lightBg: "rgba(239, 246, 255, 0.95)",
    darkBg: "rgba(11, 26, 46, 0.9)",
    lightHoverBg: "rgba(37, 99, 235, 0.1)",
    darkHoverBg: "rgba(59, 130, 246, 0.25)",
    lightActiveBg: "rgba(37, 99, 235, 0.18)",
    darkActiveBg: "rgba(59, 130, 246, 0.38)",
    lightBorderColor: "rgba(96, 165, 250, 0.45)",
    darkBorderColor: "rgba(59, 130, 246, 0.45)",
    lightShadow: "0 25px 60px rgba(37, 99, 235, 0.25)",
    darkShadow: "0 30px 70px rgba(3, 8, 18, 0.85)",
    lightDropdownShadow: "0 8px 18px rgba(37, 99, 235, 0.15)",
    darkDropdownShadow: "0 14px 28px rgba(3, 8, 18, 0.65)",
  }),
  gradient3: createOverlayPalette({
    lightBg: "rgba(255, 247, 237, 0.95)",
    darkBg: "rgba(46, 26, 11, 0.9)",
    lightHoverBg: "rgba(234, 88, 12, 0.12)",
    darkHoverBg: "rgba(249, 115, 22, 0.25)",
    lightActiveBg: "rgba(234, 88, 12, 0.2)",
    darkActiveBg: "rgba(249, 115, 22, 0.4)",
    lightBorderColor: "rgba(251, 146, 60, 0.4)",
    darkBorderColor: "rgba(249, 115, 22, 0.45)",
    lightShadow: "0 25px 60px rgba(234, 88, 12, 0.25)",
    darkShadow: "0 30px 70px rgba(18, 6, 2, 0.85)",
    lightDropdownShadow: "0 8px 18px rgba(234, 88, 12, 0.15)",
    darkDropdownShadow: "0 14px 28px rgba(18, 6, 2, 0.65)",
  }),
  gradient4: createOverlayPalette({
    lightBg: "rgba(240, 253, 244, 0.95)",
    darkBg: "rgba(11, 46, 26, 0.9)",
    lightHoverBg: "rgba(22, 163, 74, 0.1)",
    darkHoverBg: "rgba(34, 197, 94, 0.22)",
    lightActiveBg: "rgba(22, 163, 74, 0.18)",
    darkActiveBg: "rgba(34, 197, 94, 0.35)",
    lightBorderColor: "rgba(74, 222, 128, 0.4)",
    darkBorderColor: "rgba(34, 197, 94, 0.45)",
    lightShadow: "0 25px 60px rgba(22, 163, 74, 0.22)",
    darkShadow: "0 30px 70px rgba(4, 14, 8, 0.85)",
    lightDropdownShadow: "0 8px 18px rgba(22, 163, 74, 0.14)",
    darkDropdownShadow: "0 14px 28px rgba(4, 14, 8, 0.63)",
  }),
  gradient5: createOverlayPalette({
    lightBg: "rgba(253, 242, 248, 0.95)",
    darkBg: "rgba(46, 11, 26, 0.9)",
    lightHoverBg: "rgba(219, 39, 119, 0.1)",
    darkHoverBg: "rgba(236, 72, 153, 0.25)",
    lightActiveBg: "rgba(219, 39, 119, 0.2)",
    darkActiveBg: "rgba(236, 72, 153, 0.38)",
    lightBorderColor: "rgba(244, 114, 182, 0.4)",
    darkBorderColor: "rgba(236, 72, 153, 0.45)",
    lightShadow: "0 25px 60px rgba(219, 39, 119, 0.25)",
    darkShadow: "0 30px 70px rgba(18, 2, 8, 0.85)",
    lightDropdownShadow: "0 8px 18px rgba(219, 39, 119, 0.15)",
    darkDropdownShadow: "0 14px 28px rgba(18, 2, 8, 0.65)",
  }),
  gradient6: createOverlayPalette({
    lightBg: "rgba(249, 250, 251, 0.95)",
    darkBg: "rgba(26, 26, 26, 0.9)",
    lightHoverBg: "rgba(75, 85, 99, 0.08)",
    darkHoverBg: "rgba(107, 114, 128, 0.2)",
    lightActiveBg: "rgba(75, 85, 99, 0.16)",
    darkActiveBg: "rgba(107, 114, 128, 0.32)",
    lightBorderColor: "rgba(148, 163, 184, 0.4)",
    darkBorderColor: "rgba(107, 114, 128, 0.45)",
    lightShadow: "0 25px 60px rgba(15, 23, 42, 0.2)",
    darkShadow: "0 30px 70px rgba(0, 0, 0, 0.8)",
    lightDropdownShadow: "0 8px 18px rgba(15, 23, 42, 0.14)",
    darkDropdownShadow: "0 14px 28px rgba(0, 0, 0, 0.62)",
  }),
};

/**
 * 根据当前背景类型和深色模式返回 antd 主题 token
 */
const useAntdThemeToken = () => {
  const backgroundType = useSettingStore(
    (state) => state.setting.appearance?.backgroundType || "solid",
  );
  const { isDark } = useTheme();

  const currentTheme = themeTokenMap[backgroundType] || themeTokenMap.solid;
  const isSolid = backgroundType === "solid";
  const overlayPalette =
    overlayTokenMap[backgroundType] || overlayTokenMap.solid;
  const overlayTokens = isDark ? overlayPalette.dark : overlayPalette.light;

  // 根据是否为渐变模式和深色模式返回不同的 token
  const token = {
    // 主色
    colorPrimary: currentTheme.colorPrimary,
    colorLink: currentTheme.colorLink,
    colorLinkHover: currentTheme.colorPrimaryHover,
    colorLinkActive: currentTheme.colorPrimaryActive,

    // 背景色 - 渐变模式使用透明背景
    ...(isSolid
      ? {
          // 纯色模式
          colorBgContainer: isDark ? "#141414" : "#ffffff",
          colorBgElevated: isDark ? "#1f1f1f" : "#ffffff",
          colorBgLayout: isDark ? "#0a0a0a" : "#f5f5f5",
          colorBgSpotlight: isDark ? "#2a2a2a" : "#f0f0f0",
        }
      : {
          // 渐变模式 - 使用半透明背景
          colorBgContainer: isDark
            ? "rgba(0, 0, 0, 0.3)"
            : "rgba(255, 255, 255, 0.5)",
          colorBgElevated: isDark
            ? "rgba(0, 0, 0, 0.6)"
            : "rgba(255, 255, 255, 0.9)",
          colorBgLayout: "transparent",
          colorBgSpotlight: isDark
            ? "rgba(255, 255, 255, 0.1)"
            : "rgba(0, 0, 0, 0.05)",
        }),

    // 边框色
    colorBorder: isDark ? "#2a2a2a" : "#e5e5e5",
    colorBorderSecondary: isDark ? "#1f1f1f" : "#f0f0f0",

    // 文字色
    colorText: isDark ? "#e5e5e5" : "#262626",
    colorTextSecondary: isDark ? "#a3a3a3" : "#737373",
    colorTextTertiary: isDark ? "#737373" : "#a3a3a3",
    colorTextQuaternary: isDark ? "#525252" : "#d4d4d4",

    // 圆角
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,

    // 控件高度
    controlHeight: 32,
    controlHeightLG: 40,
    controlHeightSM: 24,
  };

  return { token, isSolid, isDark, overlayTokens };
};

export default useAntdThemeToken;
