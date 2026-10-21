/**
 * 语音合成设置面板（VoiceSection 的 tts Tab）。
 * 多服务商配置（对齐 LLMSection 的 ProviderSwitcher/ProviderSection 模式）+
 * 全局"当前服务"（提供商 / 模型 / 音色）。音色下拉支持手动输入任意 voice id
 * （内置目录只是快捷项，覆盖不到的官方音色可直接填）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import clsx from "clsx";
import { produce } from "immer";
import { v4 as uuid } from "uuid";
import { ConfirmDialog, IconButton, Select, toast } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { type TTSProviderSetting, type TTSVoice } from "@/types/tts";
import { TTSPluginSettings } from "./TTSPluginSettings";
import { TTSPluginCloneSection } from "./TTSPluginCloneSection";
import { TTSProviderFactory } from "@/utils/tts";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";
import { ProviderSection, ProviderSwitcher } from "../components/ProviderLayout";
import { TtsProviderCreateDialog } from "../components/TtsProviderCreateDialog";
import { useDesktopPlugins } from "@/app/plugins/context";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function VoiceTtsPanel() {
  const ttsProviders = useSettingStore(s => s.setting.ttsProviders);
  const runtime = useDesktopPlugins();

  // 只展示已启用插件的账号，缺失插件时保留底层配置。
  const installedPluginIds = new Set(
    runtime
      ?.listSettings()
      .filter(item => item.definition.target === "tts")
      .map(item => item.context.pluginId) ?? []
  );

  const validProviders = ttsProviders.filter(provider => installedPluginIds.has(provider.pluginId));
  const usage = useSettingStore(s => s.setting.ttsUsageSettings.default);
  const updateTTSUsageSetting = useSettingStore(s => s.updateTTSUsageSetting);

  /* ── 切换条：editingId 失效时回落第一家 ── */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = validProviders.find(p => p.id === editingId) ?? validProviders[0];
  const [createOpen, setCreateOpen] = useState(false);

  /**
   * 服务商/模型与当前用法一起改：**一次用户操作只产生一次设置写入**，
   * 拆开写会广播出「用法还指向已删服务商」的中间态（多窗口回灌坑，同 LLMSection）。
   */
  const mutateProvidersAndUsage = (
    fn: (
      providers: TTSProviderSetting[],
      usageSettings: { default: { providerId: string; modelId: string; voiceId: string } | null }
    ) => void
  ) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => fn(draft.ttsProviders, draft.ttsUsageSettings)),
    }));
  };

  const [pendingDeleteProvider, setPendingDeleteProvider] = useState<TTSProviderSetting | null>(
    null
  );
  const [pendingDeleteModel, setPendingDeleteModel] = useState<string | null>(null);

  const deleteProvider = () => {
    if (!pendingDeleteProvider) return;
    const targetId = pendingDeleteProvider.id;
    mutateProvidersAndUsage((providers, usageSettings) => {
      const index = providers.findIndex(item => item.id === targetId);
      if (index !== -1) {
        providers.splice(index, 1);
      }
      if (usageSettings.default?.providerId === targetId) {
        usageSettings.default = null;
      }
    });
    if (editingId === targetId) {
      setEditingId(null);
    }
    setPendingDeleteProvider(null);
  };

  const deleteModel = () => {
    if (!pendingDeleteModel || !editing) return;
    const providerId = editing.id;
    const modelId = pendingDeleteModel;
    mutateProvidersAndUsage((providers, usageSettings) => {
      const provider = providers.find(item => item.id === providerId);
      if (!provider) return;
      provider.models = provider.models.filter(model => model.id !== modelId);
      if (
        usageSettings.default?.providerId === providerId &&
        usageSettings.default.modelId === modelId
      ) {
        usageSettings.default.modelId = provider.models[0]?.id ?? "";
        usageSettings.default.voiceId = "";
      }
    });
    setPendingDeleteModel(null);
  };

  /* ── 当前服务（提供商/模型/音色）── */
  const usageProvider = validProviders.find(item => item.id === usage?.providerId);

  const switchUsageProvider = (providerId: string) => {
    if (!providerId) {
      updateTTSUsageSetting(null);
      return;
    }
    const provider = validProviders.find(item => item.id === providerId);
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
    const available = runtime
      ?.listSettings()
      .some(
        item => item.definition.target === "tts" && item.context.pluginId === provider?.pluginId
      );
    if (!available || !currentUsage?.modelId) {
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
  }, [runtime]);

  useEffect(() => {
    const requestVersion = loadVoicesRef;
    void loadVoices();
    return () => {
      ++requestVersion.current;
    };
  }, [usageProvider, usage?.providerId, usage?.modelId, loadVoices]);

  return (
    <>
      <SettingsGroup>
        <ProviderSwitcher
          label="语音合成服务商"
          items={validProviders.map(provider => ({
            id: provider.id,
            label: provider.name || "未命名",
            meta: provider.models.length,
          }))}
          activeId={editing?.id}
          onSelect={setEditingId}
          addLabel="添加服务商"
          onAdd={() => setCreateOpen(true)}
        />
        {!editing ? (
          <div className="text-tau-meta text-ink-2 px-3 py-8 text-center">
            还没有服务商——点击「添加服务商」填入凭据，再选择模型与音色
          </div>
        ) : (
          <>
            <TTSPluginSettings
              key={editing.id}
              instance={editing}
              onDelete={() => setPendingDeleteProvider(editing)}
            />

            <ProviderSection
              title="模型"
              description={`${editing.models.length} 个 · 在「当前服务」中选用`}
              action={<AddModelButton provider={editing} />}
            >
              {editing.models.length === 0 ? (
                <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">
                  暂无模型——在插件设置中保存模型，或手动填写模型名
                </div>
              ) : (
                editing.models.map(model => (
                  <div
                    key={model.id}
                    className="hover:bg-hover rounded-tau-sm flex items-center justify-between px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <span className="text-tau-body text-ink-1 font-tau-mono truncate">
                        {model.id}
                      </span>
                      {usage?.providerId === editing.id && usage.modelId === model.id && (
                        <StatusChip tone="accent">当前使用</StatusChip>
                      )}
                    </div>
                    <IconButton
                      aria-label={`删除模型 ${model.id}`}
                      onClick={() => setPendingDeleteModel(model.id)}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </IconButton>
                  </div>
                ))
              )}
            </ProviderSection>

            <TTSPluginCloneSection
              key={`clone:${editing.id}`}
              provider={editing}
              onCloned={() => {
                if (
                  useSettingStore.getState().setting.ttsUsageSettings.default?.providerId ===
                  editing.id
                )
                  void loadVoices();
              }}
            />
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title="当前服务" description="编辑器朗读与播客生成使用的语音服务">
        <SettingRow title="提供商" description="未选择时语音合成功能不可用">
          <Select
            aria-label="语音合成提供商"
            className="w-[240px]"
            placeholder="请选择提供商"
            value={usageProvider?.id ?? null}
            emptyText="先在上方添加服务商"
            options={validProviders.map(provider => ({
              value: provider.id,
              label: provider.name || "未命名",
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

      <TtsProviderCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={draft => {
          const id = uuid();
          mutateProvidersAndUsage(providers => {
            providers.push({ id, ...draft });
          });
          setEditingId(id);
        }}
      />

      <ConfirmDialog
        open={pendingDeleteProvider !== null}
        onOpenChange={open => {
          if (!open) setPendingDeleteProvider(null);
        }}
        title="删除语音合成服务商"
        context={pendingDeleteProvider?.name}
        danger
        description="删除该服务商及其模型配置。"
        impact="当前服务若指向它会清空选择，需要重新选择账号"
        confirmText="删除"
        onConfirm={deleteProvider}
      />
      <ConfirmDialog
        open={pendingDeleteModel !== null}
        onOpenChange={open => {
          if (!open) setPendingDeleteModel(null);
        }}
        title="删除模型"
        context={pendingDeleteModel ?? undefined}
        danger
        description="从该服务商移除此模型。"
        impact="当前服务若正在使用该模型，会回落到该服务商的第一个模型"
        confirmText="删除"
        onConfirm={deleteModel}
      />
    </>
  );
}

/** 添加自定义模型 ID，服务商预设由插件设置维护。 */
function AddModelButton({ provider }: { provider: TTSProviderSetting }) {
  const mutateProviders = (fn: (providers: TTSProviderSetting[]) => void) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => fn(draft.ttsProviders)),
    }));
  };

  return (
    <Select
      aria-label={`为 ${provider.name} 添加模型`}
      className="w-[260px]"
      searchable
      creatable
      placeholder="添加模型"
      emptyText="输入模型 ID 添加"
      value={null}
      options={[]}
      onValueChange={value => {
        if (!value) return;
        let added = false;
        mutateProviders(providers => {
          const target = providers.find(item => item.id === provider.id);
          if (target && !target.models.some(model => model.id === value)) {
            target.models.push({ id: value });
            added = true;
          }
        });
        if (added) {
          toast.success(`已添加模型 ${value}`);
        } else {
          toast.info(`模型 ${value} 已存在`);
        }
      }}
    />
  );
}
