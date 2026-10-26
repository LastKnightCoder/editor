import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { produce } from "immer";
import type { JsonValue, PluginSettingsProps } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import { Button, ConfirmDialog, Input, Select, SettingRow } from "@tau/ui";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import useSettingStore from "@/stores/useSettingStore";
import { savePluginTTSConfig } from "@/commands/plugin-tts";
import { savePluginImagesConfig } from "@/commands/plugin-images";
import { savePluginVideoConfig } from "@/commands/plugin-video";
import { savePublishPluginConfig, checkPublishConnection } from "@/commands/publish";
import { updateSpeechInput } from "@/services/speechInput";
import { TTSPluginCloneSection } from "@/features/settings/sections/TTSPluginCloneSection";
import { ProviderConfigForm } from "./ProviderFormView";

type Account = {
  id: string;
  name: string;
  pluginId: string;
  config: unknown;
  models?: { id: string; label?: string }[];
  modelId?: string;
};
const update = (recipe: (draft: ReturnType<typeof useSettingStore.getState>["setting"]) => void) =>
  useSettingStore.setState(state => ({ setting: produce(state.setting, recipe) }));

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
  return (
    <div className="flex flex-col gap-4">
      <SettingRow title="账号" description="可为同一插件保存多个账号；添加和保存不会切换当前服务。">
        {account && (
          <Select
            aria-label="配置账号"
            value={account.id}
            options={accounts.map(item => ({ value: item.id, label: item.name }))}
            onValueChange={setSelected}
          />
        )}
        <Button onClick={add}>添加账号</Button>
      </SettingRow>
      {account ? (
        <>
          <SettingRow title="账号名称">
            <Input
              aria-label="账号名称"
              value={account.name}
              onChange={event =>
                update(draft => {
                  const current = (
                    target === "tts" ? draft.ttsProviders : draft.imageGeneration.providers
                  ).find(item => item.id === account.id && item.pluginId === pluginId);
                  if (current) current.name = event.target.value;
                })
              }
            />
            <Button variant="danger-soft" onClick={() => setDeleting(account)}>
              删除账号
            </Button>
          </SettingRow>
          <AccountForm key={account.id} section={section} account={account} target={target} />
          {target === "tts" && "models" in account && (
            <TTSPluginCloneSection provider={account} onCloned={() => undefined} />
          )}
        </>
      ) : (
        <p className="text-tau-meta text-ink-2">添加账号后填写连接信息，再到应用设置中选用。</p>
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

function AccountForm({
  section,
  account,
  target,
}: {
  section: RegisteredPluginSettings;
  account: Account;
  target: "tts" | "images";
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false } },
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
      </QueryClientProvider>
    );
  }
  return (
    <ProviderConfigForm
      form={section.definition.form}
      context={section.context}
      stored={stored}
      saveConfig={config => save(config)}
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
        <section aria-label="模型" className="mb-4">
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
          <Select
            aria-label="添加模型"
            searchable
            creatable
            value={null}
            placeholder="选择或输入模型 ID"
            options={defaults.map(model => ({ value: model.id, label: model.label ?? model.id }))}
            onValueChange={id =>
              setModels(items => (items.some(item => item.id === id) ? items : [...items, { id }]))
            }
          />
        </section>
      ) : (
        <SettingRow title="模型">
          <Select
            aria-label="图片模型"
            searchable
            creatable
            value={modelId || null}
            options={defaults.map(model => ({ value: model.id, label: model.label ?? model.id }))}
            onValueChange={setModelId}
          />
        </SettingRow>
      )}
    </ProviderConfigForm>
  );
}

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
        : (account?.config ?? {})) as JsonValue) ?? {}
  );
  const [modelId, setModelId] = useState(
    account?.modelId || section.definition.models?.[0]?.id || ""
  );
  const save = async (config: JsonValue, model = modelId) => {
    section.context.signal.throwIfAborted();
    if (target === "asr")
      return updateSpeechInput({ kind: "save", pluginId, modelId: model, config });
    if (target === "video") await savePluginVideoConfig(pluginId, config);
    else await savePublishPluginConfig(pluginId, config);
    update(draft => {
      if (target === "video") draft.onlineVideo.configurations[pluginId] = config;
      else draft.publish.plugin.configurations[pluginId] = config;
    });
  };
  if (section.definition.form)
    return (
      <ProviderConfigForm
        form={section.definition.form}
        context={section.context}
        stored={stored}
        saveConfig={config => save(config)}
        changed={target === "asr" && modelId !== account?.modelId}
        onReset={() => setModelId(account?.modelId || section.definition.models?.[0]?.id || "")}
        probe={
          target === "publish"
            ? async config => {
                const connected = await checkPublishConnection({
                  providerType: "plugin",
                  pluginId,
                  providerConfig: config,
                  basePath: setting.publish.local.basePath,
                  siteConfig: setting.publish.site,
                });
                if (!connected) throw new Error("连接失败，请检查账号与目标");
                return "连接正常";
              }
            : undefined
        }
      >
        {target === "asr" && (
          <SettingRow title="识别模型">
            <Select
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
        )}
      </ProviderConfigForm>
    );
  const Component = section.definition.component;
  if (!Component) return null;
  const binding: NonNullable<PluginSettingsProps["videoConfig"]> = { value: stored, save };
  return (
    <Component
      context={section.context}
      videoConfig={target === "video" ? binding : undefined}
      publishConfig={target === "publish" ? binding : undefined}
      asrConfig={target === "asr" ? { value: stored, modelId, save } : undefined}
    />
  );
}
