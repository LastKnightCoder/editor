import { useMemo } from "react";
import type { MermaidRenderPreference, MermaidThemeName } from "@tau/shared";
import useSettingStore from "@/stores/useSettingStore";

const DEFAULT_LIGHT_THEME: MermaidThemeName = "github-light";
const DEFAULT_DARK_THEME: MermaidThemeName = "github-dark";

const useMermaidRenderPreference = (): MermaidRenderPreference => {
  const mermaidSetting = useSettingStore((state) => state.setting.misc.mermaid);

  return useMemo(
    () => ({
      style: mermaidSetting?.style || "svg",
      lightTheme: mermaidSetting?.lightTheme || DEFAULT_LIGHT_THEME,
      darkTheme: mermaidSetting?.darkTheme || DEFAULT_DARK_THEME,
    }),
    [
      mermaidSetting?.style,
      mermaidSetting?.lightTheme,
      mermaidSetting?.darkTheme,
    ],
  );
};

export default useMermaidRenderPreference;
