import useTheme from "./useTheme";
import useBackgroundMode from "./useBackgroundMode";
import { ACCENT_COLORS } from "@/constants/accent";

/**
 * antd 主题 token — 全部从 accent 预设与中性表面体系派生,无 per-theme 硬编码。
 */
const useAntdThemeToken = () => {
  const { accent } = useBackgroundMode();
  const { isDark } = useTheme();

  const accentPair = ACCENT_COLORS[accent] ?? ACCENT_COLORS.indigo;
  const colorPrimary = isDark ? accentPair[1] : accentPair[0];

  const isSolid = true;

  const overlayTokens = {
    background: isDark ? "#212428" : "#ffffff",
    hoverBackground: isDark
      ? "rgba(255, 255, 255, 0.08)"
      : "rgba(0, 0, 0, 0.05)",
    activeBackground: isDark
      ? "rgba(255, 255, 255, 0.14)"
      : "rgba(0, 0, 0, 0.09)",
    borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.1)",
    textColor: isDark ? "#f0f1f3" : "#1f2430",
    secondaryTextColor: isDark ? "#b4b8c0" : "#565d6b",
    shadow: isDark
      ? "0 10px 30px rgba(0, 0, 0, 0.55)"
      : "0 10px 30px rgba(15, 23, 42, 0.14)",
    dropdownShadow: isDark
      ? "0 10px 22px rgba(0, 0, 0, 0.58)"
      : "0 6px 14px rgba(15, 23, 42, 0.12)",
  };

  const token = {
    // 主色
    colorPrimary,
    colorLink: colorPrimary,

    // 背景色 — 柔光模式下容器半透明,配合毛玻璃
    ...(isSolid
      ? {
          colorBgContainer: isDark ? "#1d2024" : "#ffffff",
          colorBgElevated: isDark ? "#212428" : "#ffffff",
          colorBgLayout: isDark ? "#16181b" : "#f2f3f5",
          colorBgSpotlight: isDark ? "#272a2f" : "#e9eaee",
        }
      : {
          colorBgContainer: isDark
            ? "rgba(30, 33, 37, 0.6)"
            : "rgba(255, 255, 255, 0.6)",
          colorBgElevated: isDark
            ? "rgba(33, 36, 40, 0.85)"
            : "rgba(255, 255, 255, 0.85)",
          colorBgLayout: "transparent",
          colorBgSpotlight: isDark
            ? "rgba(255, 255, 255, 0.1)"
            : "rgba(0, 0, 0, 0.05)",
        }),

    // 边框色
    colorBorder: isDark ? "#33373d" : "#e2e4e9",
    colorBorderSecondary: isDark ? "#26292e" : "#eceef1",

    // 文字色
    colorText: isDark ? "#eceef1" : "#22262e",
    colorTextSecondary: isDark ? "#b4b8c0" : "#565d6b",
    colorTextTertiary: isDark ? "#8a8f99" : "#878e9a",
    colorTextQuaternary: isDark ? "#5c616b" : "#c3c7ce",

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
