import { useMutationObserver } from "ahooks";
import { useState } from "react";

const useSystemTheme = () => {
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => {
    const { theme = "light" } = document.documentElement.dataset;
    return theme as "light" | "dark";
  });

  useMutationObserver(
    () => {
      const { theme = "light" } = document.documentElement.dataset;
      setSystemTheme(theme as "light" | "dark");
    },
    document.documentElement,
    {
      attributes: true,
    },
  );

  return systemTheme;
};

export default useSystemTheme;
