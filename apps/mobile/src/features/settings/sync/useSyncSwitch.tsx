// 切换同步服务：先读目标云端版本（同时验证连接），云端已有数据时底部面板确认后再切换。

import { syncTranslator, useSyncI18n } from "./i18n";
import { useState } from "react";
import type { JsonValue } from "@tau/plugins";
import type { SyncVersionResponse } from "../../../types";
import { BottomSheet } from "../../../components/BottomSheet";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import {
  enqueueProviderConfigWrite,
  flushProviderConfigWrites,
  mergeProviderSettings,
} from "../../../services/provider-config";
import { getMobileSettingSnapshot } from "../../../services/mobileSettingsBridge";
import * as tauri from "../../../services/tauri";
import { resolveSyncErrorMessage } from "./syncErrors";

interface Pending {
  providerId: string;
  name: string;
  expected: JsonValue;
  versions: SyncVersionResponse;
}

export function useSyncSwitch() {
  useSyncI18n();
  const app = useAppContext();
  const [probing, setProbing] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

  /** 读一次云端版本；后端从 setting.json 读配置，先等待排队中的写入落盘 */
  const probe = async (providerId: string) => {
    await flushProviderConfigWrites();
    await app.syncSettings.persistSetting();
    const expected =
      (getMobileSettingSnapshot() ?? app.syncSettings.safeSetting)?.sync.plugin?.configurations[
        providerId
      ] ?? null;
    const versions = await tauri.syncCheckVersions(providerId);
    return { versions, expected: expected as JsonValue };
  };

  const activate = async (providerId: string, name: string, expected: JsonValue) => {
    const setting = app.syncSettings.safeSetting;
    if (!setting) return;
    try {
      await enqueueProviderConfigWrite(async () => {
        const saved = await tauri.selectPluginProvider(
          setting.database.active,
          "sync",
          providerId,
          expected
        );
        app.syncSettings.updateSetting(previous => mergeProviderSettings(previous, saved));
      });
      setPending(null);
      toast.success(syncTranslator.t("feedback.switched", { name: name }));
    } catch (error) {
      toast.error(resolveSyncErrorMessage(error, syncTranslator.t("error.switch")));
    }
  };

  const request = async (providerId: string, name: string) => {
    if (probing) return;
    setProbing(providerId);
    try {
      const { versions, expected } = await probe(providerId);
      if (versions.remoteVersion === 0) await activate(providerId, name, expected);
      else setPending({ providerId, name, expected, versions });
    } catch (error) {
      toast.error(
        resolveSyncErrorMessage(error, syncTranslator.t("error.connectNamed", { name: name }))
      );
    } finally {
      setProbing("");
    }
  };

  const newer = pending && pending.versions.remoteVersion > pending.versions.localVersion;
  const sheet = (
    <BottomSheet
      open={pending !== null}
      title={syncTranslator.t("switch.title", { name: pending?.name ?? "" })}
      onClose={() => setPending(null)}
    >
      {pending && (
        <div className="space-y-3 pb-1">
          <p className="text-ink-2 text-tau-meta text-center leading-relaxed">
            {syncTranslator.t("switch.description", {
              name: pending.name,
              remote: pending.versions.remoteVersion,
              local: pending.versions.localVersion,
              action: syncTranslator.t(newer ? "action.downloadUpdate" : "action.syncNow"),
              effect: syncTranslator.t(newer ? "switch.replaceLocal" : "switch.replaceRemote"),
            })}
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="bg-page text-ink-1 text-tau-body h-12 flex-1 rounded-[14px] font-semibold"
            >
              {syncTranslator.t("action.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void activate(pending.providerId, pending.name, pending.expected)}
              className="bg-accent text-ink-inverse text-tau-body h-12 flex-1 rounded-[14px] font-semibold"
            >
              {syncTranslator.t("action.switch")}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );

  return { request, probe, probing, sheet };
}
