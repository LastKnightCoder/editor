import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore";

const useSyncTheme = () => {
  const {
    darkMode,
  } = useSettingStore(state => ({
    darkMode: state.setting.darkMode,
  }));

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  }, [darkMode]);
}

export default useSyncTheme;