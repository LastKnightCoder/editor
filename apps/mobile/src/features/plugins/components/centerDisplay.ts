import type { CenterTarget } from "@tau/plugins/center";
import { PLUGIN_CATEGORIES, type PluginCategory } from "@tau/plugins/package";
import type { PluginElementSupport, PortablePlatform } from "@tau/plugins/portable";

export const PLATFORM_LABELS: Record<PortablePlatform, string> = {
  desktop: "桌面",
  android: "Android",
  ios: "iOS",
};

export const ELEMENT_SUPPORT_LABELS: Record<PluginElementSupport, string> = {
  edit: "可编辑",
  render: "仅展示",
  none: "不支持",
};

const CATEGORY_LABELS = new Map<string, string>(
  PLUGIN_CATEGORIES.map(item => [item.id, item.label])
);
export const categoryLabel = (id: PluginCategory) => CATEGORY_LABELS.get(id) ?? id;
export { PLUGIN_CATEGORIES };

export type { CenterTarget };
