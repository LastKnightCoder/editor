import { saveSetting } from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import { useEffect } from "react";

const useSyncSetting = () => {
  const { initSetting, setting, inited } = useSettingStore((state) => ({
    initSetting: state.initSetting,
    setting: state.setting,
    inited: state.inited,
  }));

  useEffect(() => {
    initSetting();
  }, [initSetting]);

  useEffect(() => {
    if (!inited) return;
    saveSetting(JSON.stringify(setting, null, 2)).then();
  }, [inited, setting]);
};

export default useSyncSetting;
