import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button, Panel, UiProvider } from "@tau/ui";
import type { PluginSettingsProps } from "@tau/plugins";
import { useSettingsStore } from "@/app/settingsStore";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";

export function PluginSettingsView({
  section,
  syncConfig,
  uploadConfig,
  ttsConfig,
}: {
  section?: RegisteredPluginSettings;
  syncConfig?: PluginSettingsProps["syncConfig"];
  uploadConfig?: PluginSettingsProps["uploadConfig"];
  ttsConfig?: PluginSettingsProps["ttsConfig"];
}) {
  if (!section)
    return (
      <Panel>
        <p className="text-tau-body text-ink-2">
          插件设置暂不可用。插件可能已停用或分区已注销，重新启用后可恢复；已保存的设置仍然保留。
        </p>
      </Panel>
    );
  if (section.definition.target === "sync" && !syncConfig)
    return (
      <Button onClick={() => useSettingsStore.getState().openSettings("sync")}>
        在同步设置中配置
      </Button>
    );
  if (section.definition.target === "upload" && !uploadConfig)
    return (
      <Button onClick={() => useSettingsStore.getState().openSettings("imageBed")}>
        在资源存储中配置
      </Button>
    );
  if (section.definition.target === "tts" && !ttsConfig)
    return (
      <Button onClick={() => useSettingsStore.getState().openTTSSettings()}>
        在语音设置中配置
      </Button>
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
        key={ttsConfig?.instanceId}
        section={section}
        syncConfig={syncConfig}
        uploadConfig={uploadConfig}
        ttsConfig={ttsConfig}
      />
    </RecoverableBoundary>
  );
}

function SettingsScope({
  section,
  syncConfig,
  uploadConfig,
  ttsConfig,
}: {
  section: RegisteredPluginSettings;
  syncConfig?: PluginSettingsProps["syncConfig"];
  uploadConfig?: PluginSettingsProps["uploadConfig"];
  ttsConfig?: PluginSettingsProps["ttsConfig"];
}) {
  // 缓存跟随本次挂载，旧请求不能污染重新打开或重新启用后的分区。
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false } },
      })
  );
  const Component = section.definition.component;
  return (
    <QueryClientProvider client={client}>
      <UiProvider className="contents">
        <Component
          context={section.context}
          syncConfig={syncConfig}
          uploadConfig={uploadConfig}
          ttsConfig={ttsConfig}
        />
      </UiProvider>
    </QueryClientProvider>
  );
}
