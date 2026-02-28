import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore.ts";

const useSyncFont = () => {
  const fontSetting = useSettingStore((state) => state.setting.fontSetting);

  useEffect(() => {
    const { chineseFont, englishFont, fontSize, codeFont } = fontSetting;
    const font = `${englishFont}, ${chineseFont}`;
    document.body.style.setProperty("--font", font);
    document.body.style.setProperty("--font-size", `${fontSize}px`);
    document.body.style.setProperty(
      "--mono-font",
      `${codeFont}, ${font}, monospace`,
    );
  }, [fontSetting]);
};

export default useSyncFont;
