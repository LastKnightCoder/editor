import { useMutationObserver } from "ahooks";
import { useState } from "react";

// 宿主主题用语义 key 写 data-theme（桌面 cream/cocoa、移动端 apricot/midnight…），
// 明暗信号统一看 <html>.dark 类；data-theme="dark" 字面值仅作旧宿主兼容
const readDark = (): "light" | "dark" => {
  const root = document.documentElement;
  return root.classList.contains("dark") || root.dataset.theme === "dark" ? "dark" : "light";
};

const useSystemTheme = () => {
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(readDark);

  useMutationObserver(
    () => {
      setSystemTheme(readDark());
    },
    document.documentElement,
    {
      attributes: true,
    }
  );

  return systemTheme;
};

export default useSystemTheme;
