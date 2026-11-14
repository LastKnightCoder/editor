import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore.ts";
import { applyWindowFont } from "./applyWindowFont";

export default function useSyncFont() {
  const fontSetting = useSettingStore(state => state.setting.fontSetting);
  useEffect(() => applyWindowFont(fontSetting), [fontSetting]);
}
