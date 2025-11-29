import useSettingStore from "@/stores/useSettingStore";
import useTheme from "./useTheme";

/**
 * 根据当前背景类型和深色模式返回 antd 主题 token
 */
const useAntdThemeToken = () => {
  const backgroundType = useSettingStore(
    (state) => state.setting.appearance?.backgroundType || "solid",
  );
  const { isDark } = useTheme();

  // 主题色配置映射
  const themeTokenMap: Record<
    string,
    {
      colorPrimary: string;
      colorPrimaryHover: string;
      colorPrimaryActive: string;
      colorLink: string;
    }
  > = {
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

  const currentTheme = themeTokenMap[backgroundType] || themeTokenMap.solid;
  const isSolid = backgroundType === "solid";

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

  return { token, isSolid, isDark };
};

export default useAntdThemeToken;
