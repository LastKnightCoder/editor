import { ttsText, ttsErrorText, ttsValue, useTtsSettingsI18n } from "./tts.i18n";
import { openProviderSettings } from "@/services/open-provider-settings";
/** 选择语音账号、模型与音色；连接配置和模型目录在插件页管理。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import { SettingRow, Button, IconButton, Select, toast } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { type TTSVoice } from "@/types/tts";
import { TTSPreviewSection } from "./TTSPreviewSection";
import { TTSProviderFactory } from "@/utils/tts";
import { SettingsGroup } from "../components/SettingsGroup";
import { useDesktopPlugins } from "@/app/plugins/context";

export function VoiceTtsPanel() {
  useTtsSettingsI18n();

  const ttsProviders = useSettingStore(s => s.setting.ttsProviders);
  const runtime = useDesktopPlugins();

  const usage = useSettingStore(s => s.setting.ttsUsageSettings.default);
  const updateTTSUsageSetting = useSettingStore(s => s.updateTTSUsageSetting);

  /* ── 当前服务（提供商/模型/音色）── */
  const usageProvider = ttsProviders.find(item => item.id === usage?.providerId);
  // 插件缺失或停用的账号照常显示，但不创建语音实例
  const hasActivePlugin = useCallback(
    (pluginId: string | undefined) =>
      runtime
        ?.listSettings()
        .some(item => item.definition.target === "tts" && item.context.pluginId === pluginId) ??
      false,
    [runtime]
  );
  const usagePluginActive = hasActivePlugin(usageProvider?.pluginId);

  const switchUsageProvider = (providerId: string) => {
    if (!providerId) {
      updateTTSUsageSetting(null);
      return;
    }
    const provider = ttsProviders.find(item => item.id === providerId);
    updateTTSUsageSetting({
      providerId,
      modelId: provider?.models[0]?.id ?? "",
      voiceId: "",
    });
  };

  const switchUsageModel = (modelId: string) => {
    if (!usage) return;
    updateTTSUsageSetting({ ...usage, modelId, voiceId: "" });
  };

  const switchUsageVoice = (voiceId: string) => {
    if (!usage) return;
    updateTTSUsageSetting({ ...usage, voiceId });
  };

  /* ── 音色列表：跟随当前服务的 provider+model 拉取 ── */
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const loadVoicesRef = useRef(0);

  const loadVoices = useCallback(async () => {
    // 入口先占票：早退分支也要作废在途请求，防止旧响应回灌过期音色
    const ticket = ++loadVoicesRef.current;
    const { ttsProviders, ttsUsageSettings } = useSettingStore.getState().setting;
    const currentUsage = ttsUsageSettings.default;
    const provider = ttsProviders.find(item => item.id === currentUsage?.providerId);
    if (!hasActivePlugin(provider?.pluginId) || !currentUsage?.modelId) {
      setVoices([]);
      setVoicesLoading(false);
      return;
    }
    const synthesizer = TTSProviderFactory.getSpeechSynthesizer();
    if (!synthesizer) {
      setVoices([]);
      setVoicesLoading(false);
      return;
    }
    setVoicesLoading(true);
    try {
      const list = await synthesizer.getVoiceList();
      if (ticket === loadVoicesRef.current) {
        setVoices(list);
      }
    } catch (error) {
      if (ticket === loadVoicesRef.current) {
        setVoices([]);
        toast.error(
          ttsText("message.couldNotFetchVoices", { error: ttsValue(ttsErrorText(error)) })
        );
      }
    } finally {
      if (ticket === loadVoicesRef.current) {
        setVoicesLoading(false);
      }
    }
  }, [hasActivePlugin]);

  useEffect(() => {
    const requestVersion = loadVoicesRef;
    void loadVoices();
    return () => {
      ++requestVersion.current;
    };
  }, [usageProvider, usagePluginActive, usage?.providerId, usage?.modelId, loadVoices]);

  return (
    <>
      <SettingsGroup
        title={ttsText("ui.voiceAccounts")}
        description={ttsText("ui.manageConnectionDetailsModelsAndVoiceCloning")}
      >
        {(runtime?.listSettings().filter(item => item.definition.target === "tts") ?? []).map(
          section => (
            <SettingRow key={section.key} title={section.definition.title}>
              <Button
                onClick={() => openProviderSettings(section.context.pluginId, section.key, "voice")}
              >
                {ttsText("ui.manageAccounts")}
              </Button>
            </SettingRow>
          )
        )}
        {!runtime?.listSettings().some(item => item.definition.target === "tts") && (
          <p className="text-tau-meta text-ink-2">{ttsText("ui.installAndEnableATextToSpeech")}</p>
        )}
      </SettingsGroup>

      <SettingsGroup
        title={ttsText("ui.currentService")}
        description={ttsText("ui.voiceServiceUsedForEditorReadAloud")}
      >
        <SettingRow
          title={ttsText("ui.provider")}
          description={ttsText("ui.selectAProviderToEnableTextTo")}
        >
          <Select
            aria-label={ttsText("ui.textToSpeechProvider")}
            className="w-[240px]"
            placeholder={ttsText("ui.chooseAProvider")}
            value={usageProvider?.id ?? null}
            emptyText={ttsText("ui.addAnAccountOnThePluginPage")}
            options={ttsProviders.map(provider => ({
              value: provider.id,
              disabled: !hasActivePlugin(provider.pluginId) || provider.models.length === 0,
              label: `${provider.name || ttsText("ui.untitled")}${hasActivePlugin(provider.pluginId) ? "" : ttsText("ui.pluginInactive")}`,
            }))}
            onValueChange={switchUsageProvider}
          />
        </SettingRow>
        {usageProvider && (
          <SettingRow title={ttsText("ui.models")}>
            <Select
              aria-label={ttsText("ui.textToSpeechModel")}
              className="w-[280px]"
              placeholder={ttsText("ui.chooseAModel")}
              value={usage?.modelId || null}
              emptyText={ttsText("ui.thisProviderHasNoModelsYet")}
              options={usageProvider.models.map(model => ({
                value: model.id,
                label: model.label ?? model.id,
              }))}
              onValueChange={switchUsageModel}
            />
          </SettingRow>
        )}
        {usageProvider && usage?.modelId && (
          <SettingRow
            title={ttsText("ui.voice")}
            description={ttsText("ui.fetchedFromTheProviderYouCanAlso")}
          >
            <div className="flex items-center gap-2">
              <Select
                aria-label={ttsText("ui.textToSpeechVoice")}
                className="w-[280px]"
                searchable
                creatable
                placeholder={ttsText("ui.chooseOrEnterAVoiceID")}
                emptyText={ttsText("ui.noVoicesYouCanEnterAVoice")}
                value={usage.voiceId || null}
                options={voices.map(voice => ({
                  value: voice.id,
                  label: `${voice.name}${voice.description ? ` · ${voice.description}` : ""}`,
                }))}
                onValueChange={switchUsageVoice}
              />
              <IconButton
                aria-label={ttsText("ui.refreshVoices")}
                disabled={voicesLoading}
                onClick={() => void loadVoices()}
              >
                <RefreshCw
                  size={15}
                  strokeWidth={1.75}
                  className={clsx(voicesLoading && "animate-spin")}
                />
              </IconButton>
            </div>
          </SettingRow>
        )}
      </SettingsGroup>

      <TTSPreviewSection providers={ttsProviders} usage={usage} isAvailable={hasActivePlugin} />
    </>
  );
}
