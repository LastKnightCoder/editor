import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore";

const useSyncTheme = () => {
  const { darkMode } = useSettingStore((state) => ({
    darkMode: state.setting.darkMode,
  }));

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);
};

export default useSyncTheme;
