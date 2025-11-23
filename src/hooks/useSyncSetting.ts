import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import useSettingStore from "@/stores/useSettingStore";
import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";

const useSyncSetting = () => {
  const clientIdRef = useRef<string>(uuidv4());
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
    if (isServerReady) {
      initSetting(clientIdRef.current);
    }
  }, [isServerReady, initSetting]);

  useEffect(() => {
    if (client && inited) {
      client.sendRequest("set-user-setting", {
        setting,
        clientId: clientIdRef.current,
      });
    }
  }, [inited, setting, client]);
};

export default useSyncSetting;
