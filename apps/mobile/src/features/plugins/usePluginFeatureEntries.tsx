import { useMobilePlugins } from "../../app/plugins/context";
import { toast } from "../../components/toast";
import type { FeatureGridEntry } from "../settings/SettingsPage";
import { PluginIcon } from "./components/PluginIcon";

/** 已启用插件的功能入口，按启用（注册）顺序；接在「我的」功能宫格的内置功能之后 */
export function usePluginFeatureEntries(): FeatureGridEntry[] {
  const runtime = useMobilePlugins();
  return [...(runtime?.entries.values() ?? [])]
    .filter(item => runtime?.active(item.context))
    .map(({ definition, context }) => {
      const Icon = definition.icon;
      return {
        key: `${context.pluginId}:${definition.id}`,
        label: definition.title,
        tile: Icon ? (
          <PluginIcon id={context.pluginId} name={definition.title} size="grid">
            <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
          </PluginIcon>
        ) : (
          <PluginIcon id={context.pluginId} name={definition.title} size="grid" />
        ),
        onClick: () =>
          void definition.page.open(definition.params).catch(error => toast.error(String(error))),
      };
    });
}
