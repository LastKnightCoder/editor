import { createFallbackThemeColors, useEditorConfig } from "../contexts/EditorConfig";

const useThemeColors = () => {
  const config = useEditorConfig();
  return config?.theme.colors ?? createFallbackThemeColors();
};

export default useThemeColors;
