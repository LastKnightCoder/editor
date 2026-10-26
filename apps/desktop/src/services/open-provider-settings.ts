import { useSettingsStore } from "@/app/settingsStore";
import { PLUGIN_DETAIL_KEY } from "@/app/plugins/runtime";
import { openPage } from "./page-navigation";

/** 从应用设置进入插件配置页，保存与服务选用分别完成。 */
export function openProviderSettings(pluginId: string, section?: string, from?: string) {
  useSettingsStore.getState().closeSettings();
  openPage(PLUGIN_DETAIL_KEY, {
    pluginId,
    tab: "settings",
    ...(section ? { section } : {}),
    ...(from ? { from } : {}),
  });
}
