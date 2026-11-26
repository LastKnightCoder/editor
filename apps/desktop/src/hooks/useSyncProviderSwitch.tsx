/** 切换同步服务：先读目标云端版本，云端已有数据时确认后再切换。 */

import { syncTranslator, useSyncI18n } from "../features/settings/sync/i18n";
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
  useSyncI18n();
  const [probing, setProbing] = useState("");
  const [pending, setPending] = useState<PendingSwitch | null>(null);

  const commit = (pluginId: string, name: string) => {
    selectSyncProvider(pluginId);
    toast.success(syncTranslator.t("feedback.switched", { name: name }));
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
      toast.error(
        syncTranslator.t("error.connectReason", { name: name, reason: errorText(error) })
      );
    } finally {
      setProbing("");
    }
  };

  const newer = pending && pending.remoteVersion > pending.localVersion;
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={open => !open && setPending(null)}
      title={syncTranslator.t("switch.title", { name: pending?.name ?? "" })}
      description={
        pending
          ? syncTranslator.t("switch.desktopDescription", {
              name: pending.name,
              remote: pending.remoteVersion,
              local: pending.localVersion,
              effect: syncTranslator.t(newer ? "switch.pullEffect" : "switch.uploadEffect"),
            })
          : ""
      }
      impact={syncTranslator.t("switch.retained")}
      confirmText={syncTranslator.t("action.switch")}
      onConfirm={() => {
        if (pending) commit(pending.pluginId, pending.name);
        setPending(null);
      }}
    />
  );

  return { request, probing, dialog };
}
