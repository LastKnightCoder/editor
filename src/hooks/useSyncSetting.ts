import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import useSettingStore from "@/stores/useSettingStore";
import { useEffect } from "react";

const useSyncSetting = () => {
  const { initSetting, inited, setting } = useSettingStore((state) => ({
    initSetting: state.initSetting,
    inited: state.inited,
    setting: state.setting,
  }));
  const { isServerReady, client } = useBackendWebsocketStore((state) => ({
    isServerReady: state.isServerReady,
    client: state.client,
  }));

  useEffect(() => {
    console.log("isServerReady", isServerReady);
    if (isServerReady) {
      initSetting();
    }
  }, [isServerReady, initSetting]);

  useEffect(() => {
    if (client && inited) {
      client.sendRequest("set-user-setting", setting);
    }
  }, [inited, setting, client]);
};

export default useSyncSetting;
