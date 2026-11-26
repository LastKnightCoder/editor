import { ttsText, useTtsSettingsI18n } from "./tts.i18n";
import { useState } from "react";
import { SettingRow, Select, toast } from "@tau/ui";
import { VoiceClonePanel } from "./voice-clone/VoiceClonePanel";
import type { CloneVoiceItem } from "./voice-clone/types";
import type { PluginTTSProviderSetting } from "@/types/tts";
import { TTSProviderFactory } from "@/utils/tts";
import { SettingsCardSection } from "@/features/plugins/components/SettingsCard";

export function TTSPluginCloneSection({
  provider,
  onCloned,
}: {
  provider: PluginTTSProviderSetting;
  onCloned(): void;
}) {
  useTtsSettingsI18n();

  const [selected, setSelected] = useState("");
  const modelId = provider.models.some(model => model.id === selected)
    ? selected
    : (provider.models[0]?.id ?? "");
  return (
    <SettingsCardSection
      title={ttsText("ui.voiceCloning")}
      description={ttsText("ui.useTheModelOfTheAccountBeing")}
    >
      <SettingRow title={ttsText("ui.targetModelForCloning")}>
        <Select
          className="w-[300px] max-w-full"
          aria-label={ttsText("ui.targetModelForCloning")}
          value={modelId}
          options={provider.models.map(model => ({
            value: model.id,
            label: model.label || model.id,
          }))}
          onValueChange={setSelected}
        />
      </SettingRow>
      {/* 小节只给 1.5 内收，非行式内容补到与 SettingRow 的 px-3 对齐 */}
      <div className="px-3 pb-3">
        {modelId ? (
          <CloneForm
            key={provider.id + ":" + modelId}
            provider={provider}
            modelId={modelId}
            onCloned={onCloned}
          />
        ) : (
          <p className="text-tau-meta text-ink-2">{ttsText("ui.configureAModelFirst")}</p>
        )}
      </div>
    </SettingsCardSection>
  );
}
function CloneForm({
  provider,
  modelId,
  onCloned,
}: {
  provider: PluginTTSProviderSetting;
  modelId: string;
  onCloned(): void;
}) {
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CloneVoiceItem[]>(() => [
    { id: crypto.randomUUID(), voiceId: "", voiceIdError: "", audioFile: null },
  ]);
  return (
    <VoiceClonePanel
      showCloneForm={open}
      setShowCloneForm={setOpen}
      cloneLoading={loading}
      setCloneLoading={setLoading}
      cloneItems={items}
      setCloneItems={setItems}
      voices={[]}
      getCloner={() => TTSProviderFactory.createFromSetting(provider, modelId)?.cloning ?? null}
      addVoiceToList={() => onCloned()}
      notify={(type, text) => toast[type](text)}
    />
  );
}
