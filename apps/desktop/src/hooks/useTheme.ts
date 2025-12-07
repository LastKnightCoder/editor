import { useMutationObserver } from "ahooks";
import { useMemo, useState } from "react";

const useTheme = () => {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const { theme = "light" } = document.documentElement.dataset;
    return theme as "light" | "dark";
  });

  useMutationObserver(
    () => {
      const { theme = "light" } = document.documentElement.dataset;
      setTheme(theme as "light" | "dark");
    },
    document.documentElement,
    {
      attributes: true,
    },
  );

  const isDark = useMemo(() => {
    return theme === "dark";
  }, [theme]);

  return {
    theme,
    isDark,
  };
};

export default useTheme;
