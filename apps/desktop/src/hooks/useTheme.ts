import { useMutationObserver } from "ahooks";
import { useMemo, useState } from "react";

// 主题 runtime 写入的是语义 key（cream/cocoa），明暗信号看 <html>.dark 类；
// data-theme="dark" 字面值仅作旧入口兼容
const readTheme = (): "light" | "dark" => {
  const root = document.documentElement;
  return root.classList.contains("dark") || root.dataset.theme === "dark" ? "dark" : "light";
};

const useTheme = () => {
  const [theme, setTheme] = useState<"light" | "dark">(readTheme);

  useMutationObserver(
    () => {
      setTheme(readTheme());
    },
    document.documentElement,
    {
      attributes: true,
    }
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
