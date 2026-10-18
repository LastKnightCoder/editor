import { produce } from "immer";
import { useMemo } from "react";
import { copyJson } from "@tau/plugins/host";
import { Button, Input } from "@tau/ui";
import { useDesktopPlugins } from "@/app/plugins/context";
import { PluginSettingsView } from "@/features/plugins/views/PluginSettingsView";
import { savePluginTTSConfig } from "@/commands/plugin-tts";
import useSettingStore from "@/stores/useSettingStore";
import { isPluginTTS, type PluginTTSProviderSetting } from "@/types/tts";
import { SettingRow } from "../components/SettingRow";
import { ProviderSection } from "../components/ProviderLayout";

export function TTSPluginSettings({
  instance,
  onDelete,
}: {
  instance: PluginTTSProviderSetting;
  onDelete(): void;
}) {
  const runtime = useDesktopPlugins();
  const config = useMemo(() => copyJson(instance.config), [instance.config]);
  const section = runtime
    ?.listSettings()
    .find(item => item.context.pluginId === instance.pluginId && item.definition.target === "tts");
  return (
    <ProviderSection
      title={instance.name}
      action={
        <Button variant="ghost" onClick={onDelete}>
          删除服务商
        </Button>
      }
    >
      <SettingRow title="名称">
        <Input
          value={instance.name}
          onChange={event => {
            useSettingStore.setState(state => ({
              setting: produce(state.setting, draft => {
                const current = draft.ttsProviders.find(item => item.id === instance.id);
                if (current) current.name = event.target.value;
              }),
            }));
          }}
        />
      </SettingRow>
      <PluginSettingsView
        section={section}
        ttsConfig={{
          instanceId: instance.id,
          value: config,
          models: instance.models,
          save: async (config, models) => {
            await savePluginTTSConfig(instance.id, instance.pluginId, config, models);
            useSettingStore.setState(state => ({
              setting: produce(state.setting, draft => {
                const current = draft.ttsProviders.find(item => item.id === instance.id);
                if (!current || !isPluginTTS(current) || current.pluginId !== instance.pluginId)
                  return;
                current.config = config;
                current.models = models.map(model => ({ ...model }));
                const usage = draft.ttsUsageSettings.default;
                if (
                  usage?.providerId === instance.id &&
                  !models.some(model => model.id === usage.modelId)
                ) {
                  usage.modelId = models[0]?.id ?? "";
                  usage.voiceId = "";
                }
              }),
            }));
          },
        }}
      />
    </ProviderSection>
  );
}
