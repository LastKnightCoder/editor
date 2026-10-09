/**
 * 语音合成设置面板（VoiceSection 的 tts Tab）。
 * 多服务商配置（对齐 LLMSection 的 ProviderSwitcher/ProviderSection 模式）+
 * 全局"当前服务"（提供商 / 模型 / 音色）。音色下拉支持手动输入任意 voice id
 * （内置目录只是快捷项，覆盖不到的官方音色可直接填）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import clsx from "clsx";
import { produce } from "immer";
import { v4 as uuid } from "uuid";
import { Button, ConfirmDialog, IconButton, Input, Select, toast } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { ETTSProvider, type TTSProviderSetting, type TTSVoice } from "@/types/tts";
import { TTSProviderFactory } from "@/utils/tts";
import { TTS_PROVIDER_PRESETS } from "@/utils/tts/catalog";
import { useSettingsStore } from "@/app/settingsStore";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";
import {
  FieldBox,
  ProviderSection,
  ProviderSwitcher,
  SecretInput,
} from "../components/ProviderLayout";
import { TtsProviderCreateDialog } from "../components/TtsProviderCreateDialog";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function VoiceTtsPanel() {
  const ttsProviders = useSettingStore(s => s.setting.ttsProviders);
  const usage = useSettingStore(s => s.setting.ttsUsageSettings.default);
  const updateTTSUsageSetting = useSettingStore(s => s.updateTTSUsageSetting);

  /* ── 切换条：editingId 失效时回落第一家 ── */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = ttsProviders.find(p => p.id === editingId) ?? ttsProviders[0];
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

  const updateProviderField = <K extends keyof TTSProviderSetting>(
    providerId: string,
    field: K,
    value: TTSProviderSetting[K]
  ) => {
    mutateProvidersAndUsage(providers => {
      const provider = providers.find(item => item.id === providerId);
      if (provider) {
        provider[field] = value;
      }
    });
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
        // 用法回落到剩余第一家（带模型的），否则清空
        const fallback = providers.find(item => item.models.length > 0);
        usageSettings.default = fallback
          ? { providerId: fallback.id, modelId: fallback.models[0]?.id ?? "", voiceId: "" }
          : null;
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
  const usageProvider = ttsProviders.find(item => item.id === usage?.providerId);

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
    const provider = TTSProviderFactory.getTTSProvider();
    const currentUsage = useSettingStore.getState().setting.ttsUsageSettings.default;
    if (!provider || !currentUsage?.modelId) {
      setVoices([]);
      setVoicesLoading(false);
      return;
    }
    setVoicesLoading(true);
    try {
      const list = await provider.getVoiceList();
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
  }, []);

  useEffect(() => {
    void loadVoices();
  }, [usage?.providerId, usage?.modelId, loadVoices]);

  return (
    <>
      <SettingsGroup>
        <ProviderSwitcher
          label="语音合成服务商"
          items={ttsProviders.map(provider => ({
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
            <ProviderSection
              title="连接"
              description={`${editing.name || "未命名"} 的名称与凭据`}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  onClick={() => setPendingDeleteProvider(editing)}
                >
                  删除服务商
                </Button>
              }
            >
              <SettingRow title="名称">
                <FieldBox>
                  <Input
                    value={editing.name}
                    placeholder="如 阿里云百炼"
                    onChange={e => updateProviderField(editing.id, "name", e.target.value)}
                  />
                </FieldBox>
              </SettingRow>
              <SettingRow title="API Key">
                <FieldBox>
                  <SecretInput
                    label="API Key"
                    value={editing.apiKey}
                    placeholder={editing.providerType === ETTSProvider.Qwen ? "sk-…" : "eyJ…"}
                    onChange={value => updateProviderField(editing.id, "apiKey", value)}
                    onCopy={() => {
                      void navigator.clipboard.writeText(editing.apiKey).then(
                        () => toast.success("API Key 已复制到剪贴板"),
                        () => toast.error("复制失败，请手动选择复制")
                      );
                    }}
                  />
                </FieldBox>
              </SettingRow>
              {editing.providerType === ETTSProvider.Qwen && (
                <SettingRow title="Base URL" description="留空使用官方地址">
                  <FieldBox>
                    <Input
                      className="font-tau-mono"
                      value={editing.baseUrl ?? ""}
                      placeholder="https://dashscope.aliyuncs.com"
                      spellCheck={false}
                      onChange={e =>
                        updateProviderField(
                          editing.id,
                          "baseUrl",
                          e.target.value.trim() || undefined
                        )
                      }
                    />
                  </FieldBox>
                </SettingRow>
              )}
            </ProviderSection>

            <ProviderSection
              title="模型"
              description={`${editing.models.length} 个 · 在「当前服务」中选用`}
              action={<AddModelButton provider={editing} />}
            >
              {editing.models.length === 0 ? (
                <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">
                  暂无模型——从内置候选添加，或手动填写模型名
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

            {editing.providerType === ETTSProvider.Qwen && (
              <QwenVoiceCloneSection provider={editing} onCloned={loadVoices} />
            )}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title="当前服务" description="编辑器朗读与播客生成使用的语音服务">
        <SettingRow title="提供商" description="未选择时语音合成功能不可用">
          <Select
            aria-label="语音合成提供商"
            className="w-[240px]"
            placeholder="请选择提供商"
            value={usage?.providerId ?? null}
            emptyText="先在上方添加服务商"
            options={ttsProviders.map(provider => ({
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
        impact="当前服务若指向它会回落到其他服务商"
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

/** 添加模型：内置候选下拉（creatable 允许手填任意模型 id） */
function AddModelButton({ provider }: { provider: TTSProviderSetting }) {
  const preset = TTS_PROVIDER_PRESETS.find(item => item.providerType === provider.providerType);
  const candidateOptions = (preset?.models ?? [])
    .filter(model => !provider.models.some(existing => existing.id === model.id))
    .map(model => ({ value: model.id, label: model.label ?? model.id }));

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
      emptyText="输入模型名添加（如 qwen-audio-3.1-tts-flash）"
      value={null}
      options={candidateOptions}
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

/** Qwen 音色复刻：本地参考音频经资源上传（OSS/S3）中转拿公网 URL 后提交百炼 */
function QwenVoiceCloneSection({
  provider,
  onCloned,
}: {
  provider: TTSProviderSetting;
  onCloned: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [voiceName, setVoiceName] = useState("");
  const [cloning, setCloning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClone = async () => {
    if (!file) {
      toast.warning("请先选择参考音频（建议 10~20 秒清晰人声）");
      return;
    }
    const usage = useSettingStore.getState().setting.ttsUsageSettings.default;
    const modelId = usage?.providerId === provider.id ? usage.modelId : provider.models[0]?.id;
    if (!provider.apiKey.trim()) {
      toast.error("请先填写 API Key");
      return;
    }
    if (!modelId) {
      toast.error("该服务商还没有可用模型，请先在「模型」中添加");
      return;
    }
    const tts = TTSProviderFactory.createFromSetting(provider, modelId);
    if (!tts) {
      toast.error("语音服务实例创建失败，请检查配置");
      return;
    }
    setCloning(true);
    try {
      if (!tts.uploadReferenceAudio || !tts.cloneVoice) {
        throw new Error("该服务商不支持应用内复刻");
      }
      const audioUrl = await tts.uploadReferenceAudio(file);
      const voiceId = await tts.cloneVoice(audioUrl, {
        voiceId: "",
        voiceName: voiceName.trim() || file.name,
      });
      const isCurrentUsage =
        useSettingStore.getState().setting.ttsUsageSettings.default?.providerId === provider.id;
      toast.success(
        voiceId
          ? `复刻已提交（${modelId}），音色 ID：${voiceId}`
          : `复刻已提交（${modelId}），音色部署需要一点时间`
      );
      if (isCurrentUsage) {
        toast.info("音色部署完成后刷新音色列表即可选用");
      }
      setFile(null);
      setVoiceName("");
      onCloned();
    } catch (error) {
      toast.error(`音色复刻失败：${errorText(error)}`);
    } finally {
      setCloning(false);
    }
  };

  return (
    <ProviderSection
      title="音色复刻"
      description="本地参考音频经「资源存储」配置的 OSS/S3 中转后提交百炼（需公开读）"
    >
      <SettingRow title="参考音频" description="WAV / MP3 / M4A，10~20 秒清晰单人朗读">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4"
            className="hidden"
            onChange={e => {
              setFile(e.target.files?.[0] ?? null);
              // 清空 value 以便再次选择同一文件时仍触发 change
              e.target.value = "";
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            选择文件
          </Button>
          {file && (
            <span className="text-tau-meta text-ink-2 max-w-[200px] truncate">{file.name}</span>
          )}
        </div>
      </SettingRow>
      <SettingRow title="音色名称" description="用于生成音色 ID 前缀（字母/数字）">
        <FieldBox>
          <Input
            value={voiceName}
            placeholder="如 myvoice"
            onChange={e => setVoiceName(e.target.value)}
          />
        </FieldBox>
      </SettingRow>
      <SettingRow title="">
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={Upload}
            loading={cloning}
            loadingText="复刻中…"
            disabled={!file}
            onClick={() => void handleClone()}
          >
            开始复刻
          </Button>
          <button
            type="button"
            className="text-tau-meta text-accent-text font-medium hover:underline"
            onClick={() => useSettingsStore.getState().openSettings("imageBed")}
          >
            资源存储未配置 OSS/S3？去设置
          </button>
        </div>
      </SettingRow>
    </ProviderSection>
  );
}
