import type { PluginDefinition } from "@tau/plugins";
import { ContentPluginRegistry } from "@tau/plugins/content";
export const publishedContentPlugins = new ContentPluginRegistry();
export function setPublishedPlugins(next: readonly PluginDefinition[]) {
  publishedContentPlugins.install(next);
}
export const publishedPluginDefinitions = () => publishedContentPlugins.list();
export const publishedEditorExtensions = () => publishedContentPlugins.extensions;
