// 切换同步服务：先读目标云端版本（同时验证连接），云端已有数据时底部面板确认后再切换。

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
      toast.success(`已改为同步到 ${name}`);
    } catch (error) {
      toast.error(resolveSyncErrorMessage(error, "切换服务失败"));
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
      toast.error(resolveSyncErrorMessage(error, `无法连接 ${name}，请检查配置`));
    } finally {
      setProbing("");
    }
  };

  const newer = pending && pending.versions.remoteVersion > pending.versions.localVersion;
  const sheet = (
    <BottomSheet
      open={pending !== null}
      title={`改为同步到 ${pending?.name ?? ""}？`}
      onClose={() => setPending(null)}
    >
      {pending && (
        <div className="space-y-3 pb-1">
          <p className="text-ink-2 text-tau-meta text-center leading-relaxed">
            {pending.name} 上已有一份数据库（v{pending.versions.remoteVersion}），本机为 v
            {pending.versions.localVersion}。切换后「{newer ? "下载更新" : "立即同步"}」会
            {newer ? "用云端版本替换本机数据库" : "用本机数据库覆盖云端"}，原服务上的数据会保留。
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="bg-page text-ink-1 text-tau-body h-12 flex-1 rounded-[14px] font-semibold"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void activate(pending.providerId, pending.name, pending.expected)}
              className="bg-accent text-ink-inverse text-tau-body h-12 flex-1 rounded-[14px] font-semibold"
            >
              切换
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );

  return { request, probe, probing, sheet };
}
