import { useEffect, useState } from "react";

export type MobileTheme = "light" | "dark";

function readThemeFromRoot(): MobileTheme {
  if (typeof document === "undefined") {
    return "light";
  }
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useMobileTheme() {
  const [theme, setTheme] = useState<MobileTheme>(() => readThemeFromRoot());

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setTheme(readThemeFromRoot());
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return {
    theme,
    isDark: theme === "dark",
  };
}

export default useMobileTheme;
