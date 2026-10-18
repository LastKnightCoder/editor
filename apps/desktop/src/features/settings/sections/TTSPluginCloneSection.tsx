import { useState } from "react";
import { Select, toast } from "@tau/ui";
import { VoiceClonePanel } from "@/components/PodcastGenerationModal/VoiceClonePanel";
import type { CloneVoiceItem } from "@/components/PodcastGenerationModal/types";
import type { PluginTTSProviderSetting } from "@/types/tts";
import { TTSProviderFactory } from "@/utils/tts";
import { ProviderSection } from "../components/ProviderLayout";
import { SettingRow } from "../components/SettingRow";

export function TTSPluginCloneSection({
  provider,
  onCloned,
}: {
  provider: PluginTTSProviderSetting;
  onCloned(): void;
}) {
  const [selected, setSelected] = useState("");
  const modelId = provider.models.some(model => model.id === selected)
    ? selected
    : (provider.models[0]?.id ?? "");
  return (
    <ProviderSection title="音色复刻" description="使用当前编辑账号的模型；不会切换默认语音账号">
      <SettingRow title="复刻目标模型">
        <Select
          aria-label="复刻目标模型"
          value={modelId}
          options={provider.models.map(model => ({
            value: model.id,
            label: model.label || model.id,
          }))}
          onValueChange={setSelected}
        />
      </SettingRow>
      {modelId ? (
        <CloneForm
          key={provider.id + ":" + modelId}
          provider={provider}
          modelId={modelId}
          onCloned={onCloned}
        />
      ) : (
        <p className="text-tau-meta text-ink-2">请先配置模型。</p>
      )}
    </ProviderSection>
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
