import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { produce } from "immer";
import { Clapperboard, Layers, Mic, Pencil, Plus, Send, type LucideIcon } from "lucide-react";
import { providerFormSummary, type JsonValue, type PluginSettingsProps } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import {
  Button,
  ConfirmDialog,
  FilterPill,
  IconButton,
  Input,
  Menu,
  Select,
  SettingRow,
} from "@tau/ui";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import useSettingStore, { EPublishProvider } from "@/stores/useSettingStore";
import { savePluginTTSConfig } from "@/commands/plugin-tts";
import { savePluginImagesConfig } from "@/commands/plugin-images";
import { savePluginVideoConfig } from "@/commands/plugin-video";
import { savePluginEmbeddingConfig } from "@/commands/plugin-embeddings";
import { savePublishPluginConfig, checkPublishConnection } from "@/commands/publish";
import { updateSpeechInput } from "@/services/speechInput";
import { TTSPluginCloneSection } from "@/features/settings/sections/TTSPluginCloneSection";
import { StatusChip } from "@/features/settings/components/StatusChip";
import { MoreButton } from "./PluginParts";
import { ProviderFormView } from "./ProviderFormView";
import {
  SettingsCard,
  SettingsCardBody,
  SettingsCardHeader,
  SettingsCardIcon,
  SettingsCardSection,
} from "./SettingsCard";

type Account = {
  id: string;
  name: string;
  pluginId: string;
  config: unknown;
  models?: { id: string; label?: string }[];
  modelId?: string;
};
const update = (recipe: (draft: ReturnType<typeof useSettingStore.getState>["setting"]) => void) =>
  useSettingStore.setState(state => ({
    setting: produce(state.setting, recipe),
  }));

export function ProviderAccountSettings({ section }: { section: RegisteredPluginSettings }) {
  const { target } = section.definition;
  if (target === "tts" || target === "images")
    return <Accounts key={section.key} section={section} target={target} />;
  return <SingleAccount key={section.mountId} section={section} />;
}

function Accounts({
  section,
  target,
}: {
  section: RegisteredPluginSettings;
  target: "tts" | "images";
}) {
  const pluginId = section.context.pluginId;
  const all = useSettingStore(state =>
    target === "tts" ? state.setting.ttsProviders : state.setting.imageGeneration.providers
  );
  const accounts = all.filter(account => account.pluginId === pluginId);
  const [selected, setSelected] = useState("");
  const [deleting, setDeleting] = useState<Account>();
  const account = accounts.find(item => item.id === selected) ?? accounts[0];
  const usingId = useSettingStore(state =>
    target === "tts"
      ? state.setting.ttsUsageSettings.default?.providerId
      : state.setting.imageGeneration.currentProviderId
  );
  const add = () => {
    const id = crypto.randomUUID();
    update(draft => {
      const base = {
        id,
        pluginId,
        name: `${section.definition.title}${accounts.length ? ` ${accounts.length + 1}` : ""}`,
        config: {},
      };
      if (target === "tts") draft.ttsProviders.push({ ...base, models: [] });
      else draft.imageGeneration.providers.push({ ...base, modelId: "" });
    });
    setSelected(id);
  };
  const header = account && (
    <AccountHeader
      key={account.id}
      account={account}
      using={usingId === account.id}
      usage={target === "tts" ? "朗读与播客使用中" : "图片生成使用中"}
      summary={
        section.definition.form
          ? providerFormSummary(section.definition.form, account.config as JsonValue)
          : ""
      }
      onRename={name =>
        update(draft => {
          const current = (
            target === "tts" ? draft.ttsProviders : draft.imageGeneration.providers
          ).find(item => item.id === account.id && item.pluginId === pluginId);
          if (current) current.name = name;
        })
      }
      onDelete={() => setDeleting(account)}
    />
  );
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="账号" className="flex flex-wrap items-center gap-1.5">
        {accounts.map(item => (
          <FilterPill
            key={item.id}
            active={item.id === account?.id}
            label={item.name || "未命名账号"}
            icon={usingId === item.id && <span className="bg-ok size-1.5 rounded-full" />}
            onClick={() => setSelected(item.id)}
          />
        ))}
        <Button size="sm" variant="ghost" icon={Plus} onClick={add}>
          添加账号
        </Button>
        <span className="text-tau-meta text-ink-3 ml-auto">添加和保存不会切换当前服务</span>
      </nav>
      {account ? (
        <AccountForm
          key={account.id}
          section={section}
          account={account}
          target={target}
          header={header}
        />
      ) : (
        <p className="text-tau-meta text-ink-2">添加账号后填写连接信息，再到应用设置中选用。</p>
      )}
      {account && target === "tts" && "models" in account && (
        <SettingsCard>
          <TTSPluginCloneSection provider={account} onCloned={() => undefined} />
        </SettingsCard>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={open => !open && setDeleting(undefined)}
        title="删除账号"
        context={deleting?.name}
        description="删除账号及其模型配置；若正在使用，将清空当前选择。"
        danger
        confirmText="删除"
        onConfirm={() => {
          if (!deleting) return;
          update(draft => {
            if (target === "tts") {
              draft.ttsProviders = draft.ttsProviders.filter(item => item.id !== deleting.id);
              if (draft.ttsUsageSettings.default?.providerId === deleting.id)
                draft.ttsUsageSettings.default = null;
            } else {
              draft.imageGeneration.providers = draft.imageGeneration.providers.filter(
                item => item.id !== deleting.id
              );
              if (draft.imageGeneration.currentProviderId === deleting.id)
                draft.imageGeneration.currentProviderId = "";
            }
          });
          setDeleting(undefined);
        }}
      />
    </div>
  );
}

/** 账号卡头：名称原位改名，正被应用设置选用时显示状态，低频操作收进 ⋯ */
function AccountHeader({
  account,
  using,
  usage,
  summary,
  onRename,
  onDelete,
}: {
  account: Account;
  using: boolean;
  usage: string;
  summary: string;
  onRename(name: string): void;
  onDelete(): void;
}) {
  const [renaming, setRenaming] = useState(false);
  return (
    <SettingsCardHeader
      icon={<SettingsCardIcon letter={(account.name.trim()[0] ?? "?").toUpperCase()} />}
      title={
        renaming ? (
          <Input
            size="sm"
            wrapperClassName="w-[220px]"
            aria-label="账号名称"
            autoFocus
            value={account.name}
            onChange={event => onRename(event.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) setRenaming(false);
            }}
          />
        ) : (
          <>
            <span className="min-w-0 truncate">{account.name || "未命名账号"}</span>
            <IconButton
              className="size-6 flex-none"
              aria-label="重命名账号"
              onClick={() => setRenaming(true)}
            >
              <Pencil size={13} />
            </IconButton>
          </>
        )
      }
      status={using && <StatusChip tone="ok">{usage}</StatusChip>}
      description={summary ? <span className="font-tau-mono">{summary}</span> : "尚未填写连接信息"}
      actions={
        <MoreButton label={`${account.name || "账号"} 的更多操作`}>
          <Menu.Item danger onSelect={onDelete}>
            删除账号…
          </Menu.Item>
        </MoreButton>
      }
    />
  );
}

function AccountForm({
  section,
  account,
  target,
  header,
}: {
  section: RegisteredPluginSettings;
  account: Account;
  target: "tts" | "images";
  header: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false },
        },
      })
  );
  const defaults = section.definition.models ?? [];
  const [models, setModels] = useState(account.models?.length ? account.models : [...defaults]);
  const [modelId, setModelId] = useState(account.modelId || defaults[0]?.id || "");
  const stored = copyJson(account.config as JsonValue);
  const save = async (config: JsonValue, nextModels = models, nextModelId = modelId) => {
    section.context.signal.throwIfAborted();
    if (target === "tts")
      await savePluginTTSConfig(account.id, account.pluginId, config, nextModels);
    else await savePluginImagesConfig(account.id, account.pluginId, config, nextModelId);
    update(draft => {
      if (target === "tts") {
        const current = draft.ttsProviders.find(
          item => item.id === account.id && item.pluginId === account.pluginId
        );
        if (!current) return;
        current.config = config;
        current.models = [...nextModels];
        const usage = draft.ttsUsageSettings.default;
        if (
          usage?.providerId === account.id &&
          !nextModels.some(item => item.id === usage.modelId)
        ) {
          usage.modelId = nextModels[0]?.id ?? "";
          usage.voiceId = "";
        }
      } else {
        const current = draft.imageGeneration.providers.find(
          item => item.id === account.id && item.pluginId === account.pluginId
        );
        if (current) {
          current.config = config;
          current.modelId = nextModelId;
        }
      }
    });
  };
  if (!section.definition.form) {
    const Component = section.definition.component;
    if (!Component) return null;
    return (
      <QueryClientProvider client={client}>
        <SettingsCard header={header}>
          <SettingsCardBody>
            <Component
              context={section.context}
              ttsConfig={
                target === "tts"
                  ? {
                      instanceId: account.id,
                      value: stored,
                      models: account.models ?? [],
                      save: (value, items) => save(value, [...items]),
                    }
                  : undefined
              }
              imageConfig={
                target === "images"
                  ? {
                      instanceId: account.id,
                      value: stored,
                      modelId: account.modelId ?? "",
                      save: (value, model) => save(value, models, model),
                    }
                  : undefined
              }
            />
          </SettingsCardBody>
        </SettingsCard>
      </QueryClientProvider>
    );
  }
  return (
    <ProviderFormView
      form={section.definition.form}
      context={section.context}
      binding={{
        stored,
        persist: config => save(config),
        header,
        saveLabel: "保存账号",
      }}
      changed={
        target === "tts"
          ? JSON.stringify(models) !== JSON.stringify(account.models)
          : modelId !== account.modelId
      }
      onReset={() => {
        setModels(account.models?.length ? account.models : [...defaults]);
        setModelId(account.modelId || defaults[0]?.id || "");
      }}
    >
      {target === "tts" ? (
        <SettingsCardSection title="模型" description="朗读与播客可选的模型">
          {models.map(model => (
            <SettingRow key={model.id} title={model.label ?? model.id}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setModels(items => items.filter(item => item.id !== model.id))}
              >
                移除模型
              </Button>
            </SettingRow>
          ))}
          <div className="px-3 py-2">
            <Select
              aria-label="添加模型"
              searchable
              creatable
              value={null}
              placeholder="选择或输入模型 ID"
              options={defaults.map(model => ({
                value: model.id,
                label: model.label ?? model.id,
              }))}
              onValueChange={id =>
                setModels(items =>
                  items.some(item => item.id === id) ? items : [...items, { id }]
                )
              }
            />
          </div>
        </SettingsCardSection>
      ) : (
        <SettingsCardSection title="模型">
          <SettingRow title="图片模型" description="生成与修改图片都用这个模型">
            <Select
              className="w-[300px] max-w-full"
              aria-label="图片模型"
              searchable
              creatable
              value={modelId || null}
              options={defaults.map(model => ({
                value: model.id,
                label: model.label ?? model.id,
              }))}
              onValueChange={setModelId}
            />
          </SettingRow>
        </SettingsCardSection>
      )}
    </ProviderFormView>
  );
}

type SingleTarget = "asr" | "video" | "publish" | "embeddings";
const CAPABILITIES: Record<SingleTarget, { icon: LucideIcon; title: string; description: string }> =
  {
    asr: {
      icon: Mic,
      title: "语音识别",
      description: "在 设置 › 语音 › 语音输入 中选用",
    },
    video: {
      icon: Clapperboard,
      title: "视频网站",
      description: "添加该网站的视频时使用这份配置",
    },
    publish: {
      icon: Send,
      title: "博客发布",
      description: "在发布页的站点设置中选择发布目标",
    },
    embeddings: {
      icon: Layers,
      title: "嵌入模型",
      description: "在 设置 › 嵌入模型 中设为当前后用于知识库检索",
    },
  };

function SingleAccount({ section }: { section: RegisteredPluginSettings }) {
  const { target } = section.definition;
  const pluginId = section.context.pluginId;
  const setting = useSettingStore(state => state.setting);
  const account = setting.speechInput?.plugin.configurations[pluginId];
  const stored = copyJson(
    ((target === "video"
      ? setting.onlineVideo.configurations[pluginId]
      : target === "publish"
        ? setting.publish.plugin.configurations[pluginId]
        : target === "embeddings"
          ? setting.embedding.plugins[pluginId]?.config
          : (account?.config ?? {})) as JsonValue) ?? {}
  );
  const [modelId, setModelId] = useState(
    account?.modelId || section.definition.models?.[0]?.id || ""
  );
  const capability = CAPABILITIES[target as SingleTarget];
  const using =
    target === "asr"
      ? setting.speechInput?.active === "plugin" && setting.speechInput.plugin.id === pluginId
      : target === "embeddings"
        ? setting.embedding.active?.provider === "plugin" &&
          setting.embedding.active.pluginId === pluginId
        : target === "publish" &&
          setting.publish.active === EPublishProvider.Plugin &&
          setting.publish.plugin.id === pluginId;
  const header = (
    <SettingsCardHeader
      icon={<SettingsCardIcon icon={capability.icon} />}
      title={capability.title}
      status={using && <StatusChip tone="ok">使用中</StatusChip>}
      description={section.definition.description ?? capability.description}
    />
  );
  const save = async (config: JsonValue, model = modelId) => {
    section.context.signal.throwIfAborted();
    if (target === "asr")
      return updateSpeechInput({
        kind: "save",
        pluginId,
        modelId: model,
        config,
      });
    if (target === "video") await savePluginVideoConfig(pluginId, config);
    else if (target === "embeddings") await savePluginEmbeddingConfig(pluginId, config);
    else await savePublishPluginConfig(pluginId, config);
    update(draft => {
      if (target === "video") draft.onlineVideo.configurations[pluginId] = config;
      else if (target === "embeddings") draft.embedding.plugins[pluginId] = { config };
      else draft.publish.plugin.configurations[pluginId] = config;
    });
  };
  if (section.definition.form)
    return (
      <ProviderFormView
        form={section.definition.form}
        context={section.context}
        binding={{
          stored,
          persist: config => save(config),
          header,
          ...(target === "publish" && {
            afterSave: async config => {
              const connected = await checkPublishConnection({
                providerType: "plugin",
                pluginId,
                providerConfig: config,
                basePath: setting.publish.local.basePath,
                siteConfig: setting.publish.site,
              });
              if (!connected) throw new Error("连接失败，请检查账号与目标");
              return "连接正常";
            },
            savingText: "正在保存并测试连接…",
            saveLabel: "保存并测试",
          }),
        }}
        changed={target === "asr" && modelId !== account?.modelId}
        onReset={() => setModelId(account?.modelId || section.definition.models?.[0]?.id || "")}
      >
        {target === "asr" && (
          <SettingsCardSection title="模型">
            <SettingRow title="识别模型">
              <Select
                className="w-[300px] max-w-full"
                aria-label="识别模型"
                searchable
                creatable
                value={modelId || null}
                options={(section.definition.models ?? []).map(model => ({
                  value: model.id,
                  label: model.label ?? model.id,
                }))}
                onValueChange={setModelId}
              />
            </SettingRow>
          </SettingsCardSection>
        )}
      </ProviderFormView>
    );
  const Component = section.definition.component;
  if (!Component) return null;
  const binding: NonNullable<PluginSettingsProps["videoConfig"]> = {
    value: stored,
    save,
  };
  return (
    <SettingsCard header={header}>
      <SettingsCardBody>
        <Component
          context={section.context}
          videoConfig={target === "video" ? binding : undefined}
          publishConfig={target === "publish" ? binding : undefined}
          asrConfig={target === "asr" ? { value: stored, modelId, save } : undefined}
        />
      </SettingsCardBody>
    </SettingsCard>
  );
}
