import useSettingStore from "@/stores/useSettingStore";
import { DEFAULT_ACCENT, type AccentPreset } from "@/constants/accent";

/**
 * 获取当前外观模式:accent 预设
 */
const useBackgroundMode = () => {
  const accent = useSettingStore(
    (state) => state.setting.appearance?.accent ?? DEFAULT_ACCENT,
  ) as AccentPreset;

  return { accent };
};

export default useBackgroundMode;
