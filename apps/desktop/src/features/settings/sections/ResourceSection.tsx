import { storageTranslator, useStorageI18n } from "../storage/i18n";
import { produce } from "immer";
import { Info } from "lucide-react";
import { SettingRow, Radio, ROW_DIVIDER, Switch } from "@tau/ui";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { useDesktopPlugins } from "@/app/plugins/context";
import { LOCAL_UPLOAD_TARGET, selectUploadTarget } from "@/services/storage-providers";
import { SettingsGroup, SettingsNote } from "../components/SettingsGroup";
import { isProviderSection, ProviderChoiceList } from "../components/ProviderChoiceList";
import { StatusChip } from "../components/StatusChip";

export function ResourceSection() {
  useStorageI18n();
  const imageBed = useSettingStore(state => state.setting.imageBed);
  const runtime = useDesktopPlugins();
  const sections =
    runtime?.listSettings().filter(section => isProviderSection(section, "upload")) ?? [];
  const current =
    imageBed.active === EImageBed.Local ? LOCAL_UPLOAD_TARGET : (imageBed.plugin?.id ?? "");
  return (
    <>
      <SettingsGroup
        title={storageTranslator.t("destination.title")}
        description={storageTranslator.t("destination.hint")}
      >
        <ProviderChoiceList
          sections={sections}
          configurations={imageBed.plugin?.configurations}
          current={current}
          from="imageBed"
          addLabel={storageTranslator.t("destination.add")}
          onSelect={pluginId => selectUploadTarget(pluginId)}
          leading={name => (
            <div className={`flex min-h-14 items-center gap-3 px-3 py-2 ${ROW_DIVIDER}`}>
              <Radio
                name={name}
                value={LOCAL_UPLOAD_TARGET}
                checked={current === LOCAL_UPLOAD_TARGET}
                onChange={() => selectUploadTarget(LOCAL_UPLOAD_TARGET)}
                label={
                  <span className="text-tau-body-lg text-ink-1 inline-flex items-center gap-2 font-medium">
                    {storageTranslator.t("destination.local")}
                    {current === LOCAL_UPLOAD_TARGET && (
                      <StatusChip tone="accent">
                        {storageTranslator.t("destination.current")}
                      </StatusChip>
                    )}
                  </span>
                }
                description={
                  <span className="text-tau-meta text-ink-2">
                    {storageTranslator.t("destination.localHint")}
                  </span>
                }
              />
            </div>
          )}
        />
      </SettingsGroup>
      <SettingsGroup title={storageTranslator.t("processing.title")}>
        <SettingRow
          title={storageTranslator.t("processing.compression")}
          description={storageTranslator.t("processing.hint")}
        >
          <Switch
            aria-label={storageTranslator.t("processing.compression")}
            checked={imageBed.enableCompression}
            onCheckedChange={value =>
              useSettingStore.setState(state => ({
                setting: produce(state.setting, draft => {
                  draft.imageBed.enableCompression = value;
                }),
              }))
            }
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsNote icon={<Info size={14} />}>
        {storageTranslator.t("destination.note")}
      </SettingsNote>
    </>
  );
}
