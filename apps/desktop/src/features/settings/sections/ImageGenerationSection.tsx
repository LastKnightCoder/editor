import { imageText, useImageSettingsI18n } from "./ImageGenerationSection.i18n";
import { useId } from "react";
import { produce } from "immer";
import { isProviderFormComplete, type JsonValue } from "@tau/plugins";
import { Button, Radio, SettingRow } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { useDesktopPlugins } from "@/app/plugins/context";
import { openProviderSettings } from "@/services/open-provider-settings";
import { openPage } from "@/services/page-navigation";
import { useSettingsStore } from "@/app/settingsStore";
import { SettingsGroup } from "../components/SettingsGroup";

export function ImageGenerationSection() {
  useImageSettingsI18n();
  const { providers, currentProviderId } = useSettingStore(state => state.setting.imageGeneration);
  const runtime = useDesktopPlugins();
  const sections =
    runtime?.listSettings().filter(item => item.definition.target === "images") ?? [];
  const name = useId();
  return (
    <SettingsGroup description={imageText("description")}>
      {providers.map(provider => {
        const section = sections.find(item => item.context.pluginId === provider.pluginId);
        const ready =
          !!section &&
          !!provider.modelId &&
          (!section.definition.form ||
            isProviderFormComplete(section.definition.form, provider.config as JsonValue));
        return (
          <SettingRow
            key={provider.id}
            title={
              <Radio
                name={name}
                value={provider.id}
                checked={provider.id === currentProviderId}
                disabled={!ready}
                label={provider.name}
                onChange={() =>
                  useSettingStore.setState(state => ({
                    setting: produce(state.setting, draft => {
                      draft.imageGeneration.currentProviderId = provider.id;
                    }),
                  }))
                }
              />
            }
            description={
              !section
                ? imageText("pluginInactive")
                : !ready
                  ? imageText("notConfigured")
                  : provider.modelId
            }
          >
            <Button
              size="sm"
              onClick={() =>
                openProviderSettings(provider.pluginId, section?.key, "imageGeneration")
              }
            >
              {imageText("configure")}
            </Button>
          </SettingRow>
        );
      })}
      {sections.map(section => (
        <SettingRow
          key={section.key}
          title={section.definition.title}
          description={imageText("manageDescription")}
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              openProviderSettings(section.context.pluginId, section.key, "imageGeneration")
            }
          >
            {imageText("manageAccounts")}
          </Button>
        </SettingRow>
      ))}
      {!sections.length && (
        <Button
          onClick={() => {
            useSettingsStore.getState().closeSettings();
            openPage("plugins");
          }}
        >
          {imageText("addPlugin")}
        </Button>
      )}
    </SettingsGroup>
  );
}
