import { useEditorTheme } from "../theme/context";

/**
 * 兼容入口：保留 `{ theme, isDark }` 形态，内部走 ThemeService。
 * 新代码直接用 `useEditorTheme()`（还能取 token 实际值）。
 */
const useTheme = () => {
  const { mode, isDark } = useEditorTheme();
  return { theme: mode, isDark };
};

export default useTheme;
