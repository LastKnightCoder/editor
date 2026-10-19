import { PLUGIN_CATEGORIES, type PluginCategory } from "@tau/plugins/package";

const LABELS = new Map<string, string>(PLUGIN_CATEGORIES.map(item => [item.id, item.label]));

export const categoryLabels = (categories: readonly PluginCategory[] | undefined) =>
  (categories ?? []).map(id => LABELS.get(id) ?? id);

/** 只列出当前有插件的分类，顺序同词表 */
export function visibleCategories(
  counts: Partial<Record<PluginCategory, number>> | null | undefined
) {
  return PLUGIN_CATEGORIES.filter(item => (counts?.[item.id] ?? 0) > 0).map(item => ({
    ...item,
    count: counts![item.id]!,
  }));
}
