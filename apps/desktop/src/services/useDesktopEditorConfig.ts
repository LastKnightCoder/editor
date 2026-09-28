import { useMemo } from "react";

import type { EditorConfig } from "@tau/editor/src";
import { useThemeStore } from "@tau/themes/react";
import useSettingStore from "@/stores/useSettingStore";

/**
 * Desktop 编辑器全局配置：响应式地由设置 store 派生，
 * 经应用根部的 <EditorProvider config> 注入编辑器。
 */

export const useDesktopEditorConfig = (): EditorConfig => {
  const setting = useSettingStore(state => state.setting);
  // 明暗唯一正源是主题 runtime 的生效明暗（data-mode），不再读 setting.darkMode
  const isDark = useThemeStore(state => state.mode) === "dark";

  return useMemo(
    () => ({
      theme: { mode: isDark ? "dark" : "light" },
      appearance: {
        image: {
          borderRadius: setting.appearance?.image?.borderRadius,
          shadow: setting.appearance?.image?.shadow,
        },
      },
    }),
    [setting, isDark]
  );
};
