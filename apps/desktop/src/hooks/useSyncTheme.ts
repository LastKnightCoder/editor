import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore";
import { DEFAULT_ACCENT } from "@/constants/accent";

const useSyncTheme = () => {
  const darkMode = useSettingStore((state) => state.setting.darkMode);
  const accent = useSettingStore(
    (state) => state.setting.appearance?.accent ?? DEFAULT_ACCENT,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
};

export default useSyncTheme;
