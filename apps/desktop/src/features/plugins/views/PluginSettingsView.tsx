import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Panel, UiProvider } from "@tau/ui";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import { ProviderAccountSettings } from "../components/ProviderAccountSettings";
import { ProviderFormView } from "../components/ProviderFormView";

export function PluginSettingsView({ section }: { section?: RegisteredPluginSettings }) {
  if (!section)
    return (
      <Panel>
        <p className="text-tau-body text-ink-2">
          插件设置暂不可用。请到插件中心确认已安装并启用对应插件；已保存的设置仍然保留。
        </p>
      </Panel>
    );
  if (section.definition.target === "sync" || section.definition.target === "upload") {
    if (section.definition.form)
      return (
        <ProviderFormView
          key={section.mountId}
          definition={section.definition}
          context={section.context}
          name={section.definition.title}
        />
      );
    return (
      <Panel>
        <p className="text-tau-body text-ink-2">
          此插件版本较旧，请更新后在这里修改连接配置；已保存的配置仍然有效。
        </p>
      </Panel>
    );
  }
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
      <SettingsScope section={section} />
    </RecoverableBoundary>
  );
}
function SettingsScope({ section }: { section: RegisteredPluginSettings }) {
  // 缓存跟随本次挂载，旧请求不能污染重新启用后的分区。
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
        {section.definition.target ? (
          <ProviderAccountSettings section={section} />
        ) : Component ? (
          <Component context={section.context} />
        ) : null}
      </UiProvider>
    </QueryClientProvider>
  );
}
