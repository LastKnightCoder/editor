import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button, Panel, UiProvider, cn } from "@tau/ui";
import type { PluginSettingsProps, ProviderForm } from "@tau/plugins";
import { useSettingsStore } from "@/app/settingsStore";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import { openPage } from "@/services/page-navigation";
import {
  ProviderFormView,
  useStorageBinding,
  type ProviderFormBinding,
} from "../components/ProviderFormView";

type ProviderConfigs = Pick<
  PluginSettingsProps,
  "ttsConfig" | "imageConfig" | "videoConfig" | "publishConfig" | "asrConfig"
>;

/** 非存储目标的配置由调用方给出；按目标取对应配置的值与保存，模型与实例上下文保持原样。 */
function configBinding(
  section: RegisteredPluginSettings,
  configs: ProviderConfigs
): ProviderFormBinding | null {
  const models = section.definition.models ?? [];
  switch (section.definition.target) {
    case "tts": {
      const config = configs.ttsConfig;
      if (!config) return null;
      return {
        stored: config.value,
        persist: value => config.save(value, config.models.length ? config.models : models),
      };
    }
    case "images": {
      const config = configs.imageConfig;
      if (!config) return null;
      return {
        stored: config.value,
        persist: value => config.save(value, config.modelId || models[0]?.id || ""),
      };
    }
    case "asr": {
      const config = configs.asrConfig;
      if (!config) return null;
      return {
        stored: config.value,
        persist: value => config.save(value, config.modelId || models[0]?.id || ""),
      };
    }
    case "video":
      return configs.videoConfig
        ? { stored: configs.videoConfig.value, persist: configs.videoConfig.save }
        : null;
    case "publish":
      // 发布页抽屉「修改自动保存」：随抽屉语义自动落盘，窄容器里字段堆叠
      return configs.publishConfig
        ? {
            stored: configs.publishConfig.value,
            persist: configs.publishConfig.save,
            autoSave: true,
            layout: "inline",
          }
        : null;
    default:
      return null;
  }
}

function StorageFormView({
  section,
  target,
  form,
}: {
  section: RegisteredPluginSettings;
  target: "sync" | "upload";
  form: ProviderForm;
}) {
  const { definition, context } = section;
  const binding = useStorageBinding(target, context.pluginId, definition.title, form);
  return <ProviderFormView form={form} context={context} binding={binding} />;
}

export function PluginSettingsView({
  section,
  ttsConfig,
  imageConfig,
  videoConfig,
  publishConfig,
  asrConfig,
  embedded = false,
}: {
  section?: RegisteredPluginSettings;
  ttsConfig?: PluginSettingsProps["ttsConfig"];
  imageConfig?: PluginSettingsProps["imageConfig"];
  videoConfig?: PluginSettingsProps["videoConfig"];
  publishConfig?: PluginSettingsProps["publishConfig"];
  asrConfig?: PluginSettingsProps["asrConfig"];
  /** 已处于调用方的描边容器内：不可用提示以设置行文字呈现，不再叠阴影卡 */
  embedded?: boolean;
}) {
  if (!section) {
    const notice = (
      <p className={cn("text-tau-body text-ink-2", embedded && "px-3 py-[11px]")}>
        插件设置暂不可用。请到插件中心确认已安装并启用对应插件；已保存的设置仍然保留。
      </p>
    );
    return embedded ? notice : <Panel>{notice}</Panel>;
  }
  const { form, target } = section.definition;
  if (form && (target === "sync" || target === "upload"))
    return <StorageFormView key={section.mountId} section={section} target={target} form={form} />;
  if (form) {
    const binding = configBinding(section, {
      ttsConfig,
      imageConfig,
      videoConfig,
      publishConfig,
      asrConfig,
    });
    if (binding)
      return (
        <ProviderFormView
          key={`${section.mountId}:${ttsConfig?.instanceId ?? imageConfig?.instanceId ?? ""}`}
          form={form}
          context={section.context}
          binding={binding}
        />
      );
  }
  // 旧版插件仍以组件注册存储设置：宿主不再渲染，只提示更新
  const legacyTarget: string | undefined = section.definition.target;
  if (legacyTarget === "sync" || legacyTarget === "upload")
    return (
      <Panel>
        <p className="text-tau-body text-ink-2">
          此插件版本较旧，请更新到最新版本后在这里修改连接配置；已保存的配置仍然有效。
        </p>
      </Panel>
    );
  if (section.definition.target === "asr" && !asrConfig)
    return (
      <Button onClick={() => useSettingsStore.getState().openSpeechInputSettings()}>
        在语音输入设置中配置
      </Button>
    );
  if (section.definition.target === "tts" && !ttsConfig)
    return (
      <Button onClick={() => useSettingsStore.getState().openTTSSettings()}>
        在语音设置中配置
      </Button>
    );
  if (section.definition.target === "publish" && !publishConfig)
    return <Button onClick={() => openPage("publish")}>在博客发布页中配置</Button>;
  // 其余目标的 form 分区缺少宿主上下文时（如从插件详情直接打开）不渲染表单
  if (form)
    return (
      <Panel>
        <p className="text-tau-body text-ink-2">请在对应的应用设置中配置此服务。</p>
      </Panel>
    );
  return (
    <RecoverableBoundary
      key={section.mountId}
      fallback={({ error, reset }) => (
        <ErrorState
          error={error}
          title="插件设置渲染失败"
          actions={[{ label: "重试", onClick: reset }]}
        />
      )}
    >
      <SettingsScope
        key={imageConfig?.instanceId ?? ttsConfig?.instanceId}
        section={section}
        asrConfig={asrConfig}
        ttsConfig={ttsConfig}
        imageConfig={imageConfig}
        videoConfig={videoConfig}
        publishConfig={publishConfig}
      />
    </RecoverableBoundary>
  );
}

function SettingsScope({
  section,
  asrConfig,
  ttsConfig,
  imageConfig,
  videoConfig,
  publishConfig,
}: {
  section: RegisteredPluginSettings;
  asrConfig?: PluginSettingsProps["asrConfig"];
  ttsConfig?: PluginSettingsProps["ttsConfig"];
  imageConfig?: PluginSettingsProps["imageConfig"];
  videoConfig?: PluginSettingsProps["videoConfig"];
  publishConfig?: PluginSettingsProps["publishConfig"];
}) {
  // 缓存跟随本次挂载，旧请求不能污染重新打开或重新启用后的分区。
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false } },
      })
  );
  const Component = section.definition.component;
  if (!Component) return null;
  return (
    <QueryClientProvider client={client}>
      <UiProvider className="contents">
        <Component
          context={section.context}
          asrConfig={asrConfig}
          ttsConfig={ttsConfig}
          imageConfig={imageConfig}
          videoConfig={videoConfig}
          publishConfig={publishConfig}
        />
      </UiProvider>
    </QueryClientProvider>
  );
}
