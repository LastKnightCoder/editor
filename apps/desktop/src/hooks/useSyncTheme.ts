import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore";

const useSyncTheme = () => {
  const darkMode = useSettingStore((state) => state.setting.darkMode);
  const backgroundType = useSettingStore(
    (state) => state.setting.appearance?.backgroundType || "solid",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.dataset.accent = backgroundType;
  }, [backgroundType]);
};

export default useSyncTheme;
