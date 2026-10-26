/** 切换同步服务：先读目标云端版本，云端已有数据时确认后再切换。 */

import { useState } from "react";
import { ConfirmDialog, toast } from "@tau/ui";
import { localDatabaseVersion } from "@tau/db-schema/sync-protocol";
import useSettingStore from "@/stores/useSettingStore";
import {
  probeRemoteDatabaseVersion,
  readStoredProviderConfig,
  selectSyncProvider,
} from "@/services/storage-providers";

interface PendingSwitch {
  pluginId: string;
  name: string;
  remoteVersion: number;
  localVersion: number;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function useSyncProviderSwitch() {
  const [probing, setProbing] = useState("");
  const [pending, setPending] = useState<PendingSwitch | null>(null);

  const commit = (pluginId: string, name: string) => {
    selectSyncProvider(pluginId);
    toast.success(`已改为同步到 ${name}`);
  };

  const request = async (pluginId: string, name: string) => {
    const config = readStoredProviderConfig("sync", pluginId);
    if (!config || probing) return;
    setProbing(pluginId);
    try {
      const remote = await probeRemoteDatabaseVersion(pluginId, config);
      if (remote.version === 0) {
        commit(pluginId, name);
        return;
      }
      const { database } = useSettingStore.getState().setting;
      const localVersion = localDatabaseVersion(
        database.databases.find(item => item.name === database.active)
      );
      setPending({ pluginId, name, remoteVersion: remote.version, localVersion });
    } catch (error) {
      toast.error(`无法连接 ${name}：${errorText(error)}`);
    } finally {
      setProbing("");
    }
  };

  const newer = pending && pending.remoteVersion > pending.localVersion;
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={open => !open && setPending(null)}
      title={`改为同步到 ${pending?.name ?? ""}？`}
      description={
        pending &&
        `${pending.name} 上已有一份数据库（v${pending.remoteVersion}），本机为 v${pending.localVersion}。切换后${
          newer ? "「拉取远程」会用云端版本替换本机数据库" : "「同步到云端」会用本机数据库覆盖云端"
        }。`
      }
      impact="原服务上的数据会保留"
      confirmText="切换"
      onConfirm={() => {
        if (pending) commit(pending.pluginId, pending.name);
        setPending(null);
      }}
    />
  );

  return { request, probing, dialog };
}
