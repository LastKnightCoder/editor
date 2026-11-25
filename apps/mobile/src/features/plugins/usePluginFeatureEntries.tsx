import { useMobilePlugins } from "../../app/plugins/context";
import { toast } from "../../components/toast";
import type { FeatureEntry } from "../featureEntries/useFeatureEntries";
import { PluginIcon } from "./components/PluginIcon";

/** 已启用插件的功能入口，按启用（注册）顺序；接在内置功能之后 */
export function usePluginFeatureEntries(): FeatureEntry[] {
  const runtime = useMobilePlugins();
  return [...(runtime?.entries.values() ?? [])]
    .filter(item => runtime?.active(item.context))
    .map(({ definition, context }) => {
      const Icon = definition.icon;
      const pageId = definition.page.id;
      return {
        key: `plugin:${context.pluginId}:${definition.id}`,
        label: definition.title,
        tile: Icon ? (
          <PluginIcon id={context.pluginId} name={definition.title} size="grid">
            <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
          </PluginIcon>
        ) : (
          <PluginIcon id={context.pluginId} name={definition.title} size="grid" />
        ),
        glyph: Icon ? (
          <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
        ) : (
          <PluginIcon id={context.pluginId} name={definition.title} size="rail" />
        ),
        owns: entry => entry.key === "pluginPage" && entry.params.id === pageId,
        open: () =>
          void definition.page.open(definition.params).catch(error => toast.error(String(error))),
      };
    });
}
