import { useAppContext } from "../../../app/AppContext";
import { useMobilePlugins } from "../../../app/plugins/context";
import { getMobileSettingSnapshot } from "../../../services/mobileSettingsBridge";
import { mergeImageSettings, mutateImageSettings } from "../../../services/image-settings";
import type { ImageSettingsMutation } from "../../../types";

export function useImageDomain() {
  const app = useAppContext();
  const runtime = useMobilePlugins();
  const setting = app.syncSettings.safeSetting;
  const database = setting?.database.active ?? runtime?.workspaceId ?? "";
  const providers = [...(runtime?.settings.entries() ?? [])]
    .filter(
      ([, entry]) =>
        entry.definition.target === "images" &&
        runtime?.active(entry.context) &&
        runtime.images.list().some(item => item.context === entry.context)
    )
    .map(([id, entry]) => ({ id, ...entry }));
  const mutate = async (mutation: ImageSettingsMutation) => {
    const saved = await mutateImageSettings(database, mutation);
    if (
      getMobileSettingSnapshot()?.database.active !== database ||
      saved.database.active !== database
    )
      throw new DOMException("数据库已切换", "AbortError");
    app.syncSettings.updateSetting(previous => mergeImageSettings(previous, saved));
    return saved;
  };
  return {
    setting,
    providers,
    mutate,
    accounts: setting?.imageGeneration?.providers ?? [],
    currentId: setting?.imageGeneration?.currentProviderId ?? "",
  };
}
