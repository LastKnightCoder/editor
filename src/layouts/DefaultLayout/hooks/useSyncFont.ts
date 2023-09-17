import {useEffect, useMemo} from "react";
import useSettingStore from "@/stores/useSettingStore.ts";

const useSyncFont = () => {
  const {
    setting,
  } = useSettingStore(state => ({
    setting: state.setting,
  }));

  const fontSetting = useMemo(() => {
    return setting.fontSetting;
  }, [setting]);

  useEffect(() => {
    const { chineseFont, englishFont, fontSize } = fontSetting;
    const font = `${englishFont}, ${chineseFont}`;
    document.body.style.setProperty('--font', font);
    document.body.style.setProperty('--font-size', `${fontSize}px`);
  }, [fontSetting]);
}

export default useSyncFont;
