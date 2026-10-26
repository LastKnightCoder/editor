/* 同步与上传提供方投影：订阅插件注册表，表单声明来自插件设置分区，配置读写经原生串行保存。 */
import { savePluginProviderConfig } from "../../services/tauri";
import { enqueueProviderConfigWrite, mergeProviderSettings } from "../../services/provider-config";
import { useMemo } from "react";
import { copyJson } from "@tau/plugins/host";
import {
  isProviderFormComplete,
  providerFormSummary,
  type JsonValue,
  type ProviderForm,
} from "@tau/plugins";
import { useMobilePlugins } from "../../app/plugins/context";
import { useAppContext } from "../../app/AppContext";
import type { SettingCompat } from "../../types";

export interface ProviderEntry {
  id: string;
  name: string;
  tile: { letter: string; className: string };
  /** 旧版插件以组件注册设置时为 null：宿主不渲染其表单，只提示更新 */
  form: ProviderForm | null;
  stored: (setting: SettingCompat) => JsonValue | undefined;
  isConfigured: (setting: SettingCompat) => boolean;
  summary: (setting: SettingCompat) => string;
}

export function useProviderEntries(target: "sync" | "upload"): readonly ProviderEntry[] {
  const runtime = useMobilePlugins();
  const revision = runtime?.getSnapshot();
  return useMemo(() => {
    if (!runtime || revision === undefined) return [];
    const section = target === "sync" ? "sync" : "imageBed";
    const registrations = target === "sync" ? runtime.sync.list() : runtime.upload.list();
    return registrations
      .filter(item => runtime.active(item.context))
      .map(({ context, definition }) => {
        const settings = [...runtime.settings.values()].find(
          item => item.context === context && item.definition.target === target
        );
        const form = settings?.definition.form ?? null;
        const stored = (setting: SettingCompat) => {
          const configurations = setting[section].plugin?.configurations ?? {};
          return Object.hasOwn(configurations, context.pluginId)
            ? (copyJson(configurations[context.pluginId]) as JsonValue)
            : undefined;
        };
        const isConfigured = (setting: SettingCompat) =>
          form ? isProviderFormComplete(form, stored(setting)) : stored(setting) !== undefined;
        return {
          id: context.pluginId,
          name: definition.name,
          tile: { letter: definition.name.slice(0, 1), className: "bg-surface text-ink-2" },
          form,
          stored,
          isConfigured,
          summary: (setting: SettingCompat) =>
            !form
              ? "插件版本较旧，更新后才能修改配置"
              : isConfigured(setting)
                ? providerFormSummary(form, stored(setting)) || "已配置"
                : "尚未配置",
        };
      });
  }, [runtime, revision, target]);
}

/** 保存一个提供方的配置：原生按库与插件串行原子写入，不改变当前选用。 */
export function useSaveProviderConfig(target: "sync" | "upload") {
  const app = useAppContext();
  const runtime = useMobilePlugins();
  return (pluginId: string, config: JsonValue) => {
    const next = copyJson(config);
    return enqueueProviderConfigWrite(async () => {
      if (!runtime) throw new Error("插件尚未就绪");
      const saved = await savePluginProviderConfig(runtime.workspaceId, target, pluginId, next);
      app.syncSettings.updateSetting(previous => mergeProviderSettings(previous, saved));
    });
  };
}
