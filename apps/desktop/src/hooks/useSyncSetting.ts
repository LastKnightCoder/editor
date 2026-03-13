import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import {
  buildPersistedSettingSnapshot,
  getWeReadSettingDebugSummary,
} from "@/stores/useSettingStore";
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

    let prevPersistedSettingJson = JSON.stringify(
      buildPersistedSettingSnapshot(useSettingStore.getState().setting),
    );

    const unsubscribe = useSettingStore.subscribe((state, prevState) => {
      if (state.setting === prevState.setting) return;
      const persistedSetting = buildPersistedSettingSnapshot(state.setting);
      const persistedSettingJson = JSON.stringify(persistedSetting);
      if (persistedSettingJson === prevPersistedSettingJson) {
        return;
      }
      prevPersistedSettingJson = persistedSettingJson;
      console.info("[SettingSync] 发送设置到后端", {
        weread: getWeReadSettingDebugSummary(
          persistedSetting.integration.weread,
        ),
      });
      client.sendRequest("set-user-setting", {
        setting: persistedSetting,
        clientId: clientIdRef.current,
      });
    });

    return () => unsubscribe();
  }, [inited, client]);
};

export default useSyncSetting;
