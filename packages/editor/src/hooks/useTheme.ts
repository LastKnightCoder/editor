import { useContext, useMemo } from "react";
import { EditorContext } from "../contexts/EditorContext";
import { useEditorConfig } from "../contexts/EditorConfig";
import useSystemTheme from "./useSystemTheme";

const useTheme = () => {
  // 优先级：<Editor theme> prop > EditorProvider config > 系统主题
  const { theme: contextTheme } = useContext(EditorContext);
  const config = useEditorConfig();
  const systemTheme = useSystemTheme();

  const theme = contextTheme ?? config?.theme.mode ?? systemTheme;
  const isDark = useMemo(() => theme === "dark", [theme]);

  return {
    theme,
    isDark,
  };
};

export default useTheme;
