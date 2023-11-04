import { useMutationObserver } from "ahooks";
import { useMemo, useState } from "react";

const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    const { theme = "" } = document.documentElement.dataset;
    return theme;
  });

  useMutationObserver(() => {
    const { theme = "" } = document.documentElement.dataset;
    setTheme(theme);
  }, document.documentElement, {
    attributes: true,
  })

  const isDark = useMemo(() => {
    return theme === "dark"
  }, [theme]);

  return {
    theme,
    isDark,
  }
}

export default useTheme;
