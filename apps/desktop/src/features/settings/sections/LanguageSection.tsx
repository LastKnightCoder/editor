import { useAppI18n } from "@/app/i18n/react";
import { APP_LANGUAGES, normalizeLanguagePreference } from "@tau/shared/language";
import { Select, SettingRow } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { SettingsGroup } from "../components/SettingsGroup";

export function LanguageSection() {
  const language = useSettingStore(state => state.setting.language);
  const { t } = useAppI18n();
  return (
    <SettingsGroup title={t("language.title")} description={t("language.description")}>
      <SettingRow title={t("language.label")}>
        <Select
          value={language}
          options={[
            { value: "system", label: t("language.system") },
            ...APP_LANGUAGES.map(item => ({ value: item.locale, label: item.label })),
          ]}
          onValueChange={value =>
            useSettingStore.setState(state => ({
              setting: { ...state.setting, language: normalizeLanguagePreference(value) },
            }))
          }
        />
      </SettingRow>
    </SettingsGroup>
  );
}
