import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore";

const useSyncTheme = () => {
  const { darkMode, backgroundType } = useSettingStore((state) => ({
    darkMode: state.setting.darkMode,
    backgroundType: state.setting.appearance?.backgroundType || "solid",
  }));

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // 同步主题色到 data 属性，用于通知 editor 包主题色已变化
  useEffect(() => {
    document.documentElement.dataset.accent = backgroundType;
  }, [backgroundType]);
};

export default useSyncTheme;
