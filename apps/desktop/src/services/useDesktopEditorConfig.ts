import { useMemo } from "react";

import type { EditorConfig } from "@tau/editor/src";
import type { ThemeColors } from "@tau/editor/src/types/services";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import { ACCENT_COLORS, ACCENT_OKLCH } from "@/constants/accent";
import { openExternal } from "@/commands/extra";

/**
 * Desktop 编辑器全局配置：响应式地由设置 store 派生，
 * 经应用根部的 <EditorProvider config> 注入编辑器。
 */

/** 编辑器主题色板基底（配合 CSS 变量），强调色按 accent 设置叠加 */
const EDITOR_THEME_CLASSES: ThemeColors = {
  hoverClass: "hover:bg-[var(--th-bg-hover)]",
  activeClass: "bg-[var(--th-accent-soft)] text-[var(--th-active-text)]",
  hoverTextClass: "hover:text-[var(--th-hover-text)]",
  borderClass: "border-[var(--th-border)]",
  hoverBorderClass: "hover:border-[var(--th-border-hover)]",
  focusBorderClass: "focus:border-[var(--th-border-focus)]",
  textClass: "text-[var(--th-text)]",
  secondaryTextClass: "text-[var(--th-text-secondary)]",
  activeTextClass: "text-[var(--th-active-text)]",
  cardBorderClass: "border-[var(--th-border)]",
  cardBgClass: "bg-[var(--th-card-bg)]",
};

const getThemeColorsFromSetting = (setting: ISetting): ThemeColors => {
  const isDarkMode = !!setting.darkMode;
  const accent = setting.appearance?.accent ?? "indigo";
  const accentPair = ACCENT_COLORS[accent] ?? ACCENT_COLORS.indigo;
  const { h, c } = ACCENT_OKLCH[accent] ?? ACCENT_OKLCH.indigo;
  const s = Math.min(Math.round(c * 380), 70);
  return {
    ...EDITOR_THEME_CLASSES,
    accentColor: isDarkMode ? accentPair[1] : accentPair[0],
    accentSoftBg: isDarkMode ? `hsla(${h}, ${s}%, 70%, 0.35)` : `hsla(${h}, ${s}%, 30%, 0.25)`,
  };
};

export const useDesktopEditorConfig = (): EditorConfig => {
  const setting = useSettingStore(state => state.setting);

  return useMemo(
    () => ({
      theme: {
        mode: setting.darkMode ? "dark" : "light",
        colors: getThemeColorsFromSetting(setting),
      },
      appearance: {
        image: {
          borderRadius: setting.appearance?.image?.borderRadius,
          shadow: setting.appearance?.image?.shadow,
        },
      },
      openUrl: url => {
        void openExternal(url);
      },
    }),
    [setting]
  );
};
