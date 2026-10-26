import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button, Panel, UiProvider, cn } from "@tau/ui";
import type { PluginSettingsProps } from "@tau/plugins";
import { useSettingsStore } from "@/app/settingsStore";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import { openPage } from "@/services/page-navigation";
import { ProviderFormView } from "../components/ProviderFormView";

export function PluginSettingsView({
  section,
  ttsConfig,
  imageConfig,
  videoConfig,
  publishConfig,
  embedded = false,
}: {
  section?: RegisteredPluginSettings;
  ttsConfig?: PluginSettingsProps["ttsConfig"];
  imageConfig?: PluginSettingsProps["imageConfig"];
  videoConfig?: PluginSettingsProps["videoConfig"];
  publishConfig?: PluginSettingsProps["publishConfig"];
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
  if (section.definition.form)
    return (
      <ProviderFormView
        key={section.mountId}
        definition={section.definition}
        context={section.context}
        name={section.definition.title}
      />
    );
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
  if (section.definition.target === "asr") return null;
  if (section.definition.target === "tts" && !ttsConfig)
    return (
      <Button onClick={() => useSettingsStore.getState().openTTSSettings()}>
        在语音设置中配置
      </Button>
    );
  if (section.definition.target === "publish" && !publishConfig)
    return <Button onClick={() => openPage("publish")}>在博客发布页中配置</Button>;
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
  ttsConfig,
  imageConfig,
  videoConfig,
  publishConfig,
}: {
  section: RegisteredPluginSettings;
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
          ttsConfig={ttsConfig}
          imageConfig={imageConfig}
          videoConfig={videoConfig}
          publishConfig={publishConfig}
        />
      </UiProvider>
    </QueryClientProvider>
  );
}
