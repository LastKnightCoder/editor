import { pluginTranslator, type PluginMessageKey } from "../i18n";
import type { CenterRelease, CenterTarget } from "@tau/plugins/center";
import { PLUGIN_CATEGORIES, type PluginCategory } from "@tau/plugins/package";
import type { PortablePlatform } from "@tau/plugins/portable";

export const PLATFORM_LABELS: Record<PortablePlatform, string> = {
  get desktop() {
    return pluginTranslator.t("platform.desktop");
  },
  android: "Android",
  ios: "iOS",
};

export const categoryLabel = (id: PluginCategory) =>
  pluginTranslator.t(`category.${id}` as PluginMessageKey);
export { PLUGIN_CATEGORIES };

export type { CenterTarget };

/** 发布记录中清单申请的权限；清单没有该字段时为空。 */
export const releasePermissions = (release: CenterRelease): readonly string[] => {
  const manifest = release.content.manifest;
  return "permissions" in manifest ? (manifest.permissions ?? []) : [];
};
