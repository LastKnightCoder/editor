import { useThemeStore } from "@tau/themes/react";

const useTheme = () => {
  const theme = useThemeStore(state => state.mode);
  return {
    theme,
    isDark: theme === "dark",
  };
};

export default useTheme;
