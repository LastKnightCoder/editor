import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import { buildPersistedSettingSnapshot, isRemoteAppliedSnapshot } from "@/stores/useSettingStore";
import useSettingStore from "@/stores/useSettingStore";
import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { isMainWindow } from "@/utils/window-role";
import { connectSettingReplica } from "@/services/setting-replica";
import type { ISetting } from "@/stores/useSettingStore";
import { toast } from "@tau/ui";

const useSyncSetting = () => {
  const clientIdRef = useRef<string>(uuidv4());
  const initSetting = useSettingStore(state => state.initSetting);
  const inited = useSettingStore(state => state.inited);
  const isServerReady = useBackendWebsocketStore(state => state.isServerReady);
  const client = useBackendWebsocketStore(state => state.client);

  useEffect(() => {
    if (!isServerReady || !client) return;
    const main = isMainWindow();
    const unsubscribe = useSettingStore
      .getState()
      .subscribeSettingNotifications(clientIdRef.current);
    const disconnect = connectSettingReplica(
      main,
      () => client.sendRequest("get-user-setting", null) as Promise<ISetting>
    );
    if (main) void initSetting();
    return () => {
      unsubscribe();
      disconnect();
    };
  }, [isServerReady, client, initSetting]);

  useEffect(() => {
    if (!client || !inited) return;

    let prevPersistedSettingJson = JSON.stringify(
      buildPersistedSettingSnapshot(useSettingStore.getState().setting)
    );

    const unsubscribe = useSettingStore.subscribe((state, prevState) => {
      if (state.setting === prevState.setting) return;
      const persistedSetting = buildPersistedSettingSnapshot(state.setting);
      const persistedSettingJson = JSON.stringify(persistedSetting);
      if (persistedSettingJson === prevPersistedSettingJson) {
        return;
      }
      prevPersistedSettingJson = persistedSettingJson;
      // 远端广播应用进来的设置不回灌：否则一次改动被 N 个窗口放大成 N 次保存，
      // 窗口间任何细微差异都会变成永不收敛的来回写（见 markRemoteSettingApplied）
      if (isRemoteAppliedSnapshot(persistedSettingJson)) {
        return;
      }
      void client
        .sendRequest("set-user-setting", {
          setting: persistedSetting,
          clientId: clientIdRef.current,
        })
        .catch(error => {
          console.error("设置保存失败", error);
          toast.error("设置保存失败，请检查磁盘后重试");
        });
    });

    return () => unsubscribe();
  }, [inited, client]);
};

export default useSyncSetting;
