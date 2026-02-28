import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import useSettingStore from "@/stores/useSettingStore";
import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";

const useSyncSetting = () => {
  const clientIdRef = useRef<string>(uuidv4());
  const initSetting = useSettingStore((state) => state.initSetting);
  const inited = useSettingStore((state) => state.inited);
  const isServerReady = useBackendWebsocketStore(
    (state) => state.isServerReady,
  );
  const client = useBackendWebsocketStore((state) => state.client);

  useEffect(() => {
    if (isServerReady) {
      initSetting(clientIdRef.current);
    }
  }, [isServerReady, initSetting]);

  useEffect(() => {
    if (!client || !inited) return;

    const unsubscribe = useSettingStore.subscribe((state, prevState) => {
      if (state.setting === prevState.setting) return;
      client.sendRequest("set-user-setting", {
        setting: state.setting,
        clientId: clientIdRef.current,
      });
    });

    return () => unsubscribe();
  }, [inited, client]);
};

export default useSyncSetting;
