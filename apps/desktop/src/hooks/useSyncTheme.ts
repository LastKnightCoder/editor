import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore";
import { DEFAULT_ACCENT } from "@/constants/accent";

const useSyncTheme = () => {
  const accent = useSettingStore(state => state.setting.appearance?.accent ?? DEFAULT_ACCENT);

  // 明暗主题（data-theme/.dark）由 @tau/ui 主题 runtime 唯一写入，此处只同步 accent 预设
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
};

export default useSyncTheme;
