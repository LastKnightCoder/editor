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

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function VoiceTtsPanel() {
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
        toast.error(`获取音色列表失败：${errorText(error)}`);
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
      <SettingsGroup title="语音账号" description="连接信息、模型目录与音色复刻在插件页管理。">
        {(runtime?.listSettings().filter(item => item.definition.target === "tts") ?? []).map(
          section => (
            <SettingRow key={section.key} title={section.definition.title}>
              <Button
                onClick={() => openProviderSettings(section.context.pluginId, section.key, "voice")}
              >
                管理账号
              </Button>
            </SettingRow>
          )
        )}
        {!runtime?.listSettings().some(item => item.definition.target === "tts") && (
          <p className="text-tau-meta text-ink-2">请到插件中心安装并启用语音合成插件。</p>
        )}
      </SettingsGroup>

      <SettingsGroup title="当前服务" description="编辑器朗读与播客生成使用的语音服务">
        <SettingRow title="提供商" description="未选择时语音合成功能不可用">
          <Select
            aria-label="语音合成提供商"
            className="w-[240px]"
            placeholder="请选择提供商"
            value={usageProvider?.id ?? null}
            emptyText="先到插件页添加账号"
            options={ttsProviders.map(provider => ({
              value: provider.id,
              disabled: !hasActivePlugin(provider.pluginId) || provider.models.length === 0,
              label: `${provider.name || "未命名"}${hasActivePlugin(provider.pluginId) ? "" : "（插件未启用）"}`,
            }))}
            onValueChange={switchUsageProvider}
          />
        </SettingRow>
        {usageProvider && (
          <SettingRow title="模型">
            <Select
              aria-label="语音合成模型"
              className="w-[280px]"
              placeholder="请选择模型"
              value={usage?.modelId || null}
              emptyText="该服务商暂未添加模型"
              options={usageProvider.models.map(model => ({
                value: model.id,
                label: model.label ?? model.id,
              }))}
              onValueChange={switchUsageModel}
            />
          </SettingRow>
        )}
        {usageProvider && usage?.modelId && (
          <SettingRow title="音色" description="列表从服务商获取；也可直接输入官方文档中的音色 ID">
            <div className="flex items-center gap-2">
              <Select
                aria-label="语音合成音色"
                className="w-[280px]"
                searchable
                creatable
                placeholder="选择或输入音色 ID"
                emptyText="暂无音色——可直接输入音色 ID"
                value={usage.voiceId || null}
                options={voices.map(voice => ({
                  value: voice.id,
                  label: `${voice.name}${voice.description ? ` · ${voice.description}` : ""}`,
                }))}
                onValueChange={switchUsageVoice}
              />
              <IconButton
                aria-label="刷新音色列表"
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
