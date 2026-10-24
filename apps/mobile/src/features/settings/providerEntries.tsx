/* eslint-disable react-refresh/only-export-components -- 导出订阅式提供方投影，组件由闭包承载。 */
import { savePluginProviderConfig } from "../../services/tauri";
import { enqueueProviderConfigWrite, mergeProviderSettings } from "../../services/provider-config";
import { useMemo, type ComponentType } from "react";
import { copyJson } from "@tau/plugins/host";
import type { PluginContext, PluginSettingsDefinition } from "@tau/plugins";
import { ErrorBoundary, UiHostProvider, UiProvider } from "@tau/ui";
import { useMobilePlugins } from "../../app/plugins/context";
import { useAppContext } from "../../app/AppContext";
import { usePage, usePageInstanceContext } from "../../router";
import type { SettingCompat } from "../../types";
import type { SettingsPageProps, SettingModuleKey } from "./components/types";

export interface ProviderPanelProps {
  setting: SettingCompat;
  updateSetting: SettingsPageProps["updateSetting"];
  onOpenModule: (module: SettingModuleKey) => void;
}
export interface ProviderEntry {
  id: string;
  name: string;
  description: string;
  tile: { letter: string; className: string };
  isConfigured: (setting: SettingCompat) => boolean;
  summary: (setting: SettingCompat) => string;
  Panel: ComponentType<ProviderPanelProps>;
}

function ProviderPanel({
  context,
  definition,
  target,
}: {
  context: PluginContext;
  definition?: PluginSettingsDefinition;
  target: "sync" | "upload";
}) {
  const app = useAppContext();
  const runtime = useMobilePlugins();
  const { navigator, entryId } = usePage();
  const { phase } = usePageInstanceContext();
  const section = target === "sync" ? "sync" : "imageBed";
  const Component = definition?.component;
  const setting = app.syncSettings.safeSetting;
  const registerDismiss = useMemo(
    () => (dismiss: () => void) => {
      if (phase !== "active") return () => undefined;
      return navigator.registerBackHandler(entryId, () => {
        dismiss();
        return true;
      });
    },
    [navigator, entryId, phase]
  );
  if (!setting || !runtime?.active(context)) return <p>插件已停用，请返回插件管理。</p>;
  if (!Component) return <p>此插件没有提供配置面板。</p>;
  const config = {
    value: copyJson(setting[section].plugin?.configurations[context.pluginId] ?? {}),
    save: (value: import("@tau/plugins").JsonValue) => {
      const next = copyJson(value);
      return enqueueProviderConfigWrite(async () => {
        if (!runtime.active(context)) throw new Error("插件设置已失效");
        const saved = await savePluginProviderConfig(
          runtime.workspaceId,
          target,
          context.pluginId,
          next
        );
        context.signal.throwIfAborted();
        if (!runtime.active(context)) throw new Error("插件设置已失效");
        app.syncSettings.updateSetting(previous => mergeProviderSettings(previous, saved));
      });
    },
  };
  return (
    <ErrorBoundary>
      <UiHostProvider registerDismiss={registerDismiss}>
        <UiProvider className="contents">
          <Component
            context={context}
            {...(target === "sync" ? { syncConfig: config } : { uploadConfig: config })}
          />
        </UiProvider>
      </UiHostProvider>
    </ErrorBoundary>
  );
}

export function useProviderEntries(target: "sync" | "upload"): readonly ProviderEntry[] {
  const runtime = useMobilePlugins();
  const revision = runtime?.getSnapshot();
  return useMemo(() => {
    if (!runtime || revision === undefined) return [];
    const registrations = target === "sync" ? runtime.sync.list() : runtime.upload.list();
    return registrations
      .filter(item => runtime.active(item.context))
      .map(({ context, definition }) => {
        const section = target === "sync" ? "sync" : "imageBed";
        const settings = [...runtime.settings.values()].find(
          item => item.context === context && item.definition.target === target
        );
        const isConfigured = (setting: SettingCompat) =>
          Object.hasOwn(setting[section].plugin?.configurations ?? {}, context.pluginId);
        return {
          id: context.pluginId,
          name: definition.name,
          description: settings?.definition.description ?? "配置后可使用此存储服务",
          tile: { letter: definition.name.slice(0, 1), className: "bg-surface text-ink-2" },
          isConfigured,
          summary: (setting: SettingCompat) => (isConfigured(setting) ? "配置已保存" : "尚未配置"),
          Panel: () => (
            <ProviderPanel context={context} definition={settings?.definition} target={target} />
          ),
        };
      });
  }, [runtime, revision, target]);
}
