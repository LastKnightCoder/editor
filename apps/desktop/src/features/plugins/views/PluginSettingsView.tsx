import { pluginControlsTranslator, usePluginControlsI18n } from "../controls.i18n";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProviderForm } from "@tau/plugins";
import { Panel, UiProvider } from "@tau/ui";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import { ProviderAccountSettings } from "../components/ProviderAccountSettings";
import { ProviderFormView, useStorageBinding } from "../components/ProviderFormView";
import {
  SettingsCard,
  SettingsCardBody,
  SettingsCardHeader,
  SettingsCardIcon,
} from "../components/SettingsCard";
const t = pluginControlsTranslator.t;

export function PluginSettingsView({ section }: { section?: RegisteredPluginSettings }) {
  usePluginControlsI18n();
  if (!section)
    return (
      <Panel>
        <p className="text-tau-body text-ink-2">{t("settings.unavailable")}</p>
      </Panel>
    );
  if (section.definition.target === "sync" || section.definition.target === "upload") {
    if (section.definition.form)
      return (
        <StorageFormView
          key={section.mountId}
          section={section}
          target={section.definition.target}
          form={section.definition.form}
        />
      );
    return (
      <Panel>
        <p className="text-tau-body text-ink-2">{t("settings.legacy")}</p>
      </Panel>
    );
  }
  return (
    <RecoverableBoundary
      key={section.mountId}
      fallback={({ error, reset }) => (
        <ErrorState
          error={error}
          title={t("settings.renderFailed")}
          actions={[{ label: t("common.retry"), onClick: reset }]}
        />
      )}
    >
      <SettingsScope section={section} />
    </RecoverableBoundary>
  );
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
  usePluginControlsI18n();
  const { definition, context } = section;
  const binding = useStorageBinding(target, context.pluginId, definition.title, form);
  return <ProviderFormView form={form} context={context} binding={binding} />;
}

function SettingsScope({ section }: { section: RegisteredPluginSettings }) {
  usePluginControlsI18n();
  // 缓存跟随本次挂载，旧请求不能污染重新启用后的分区。
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false },
        },
      })
  );
  const Component = section.definition.component;
  return (
    <QueryClientProvider client={client}>
      <UiProvider className="contents">
        {section.definition.target ? (
          <ProviderAccountSettings section={section} />
        ) : Component ? (
          <SettingsCard
            header={
              <SettingsCardHeader
                icon={<SettingsCardIcon icon={SlidersHorizontal} />}
                title={section.definition.title}
                description={section.definition.description}
              />
            }
          >
            <SettingsCardBody>
              <Component context={section.context} />
            </SettingsCardBody>
          </SettingsCard>
        ) : null}
      </UiProvider>
    </QueryClientProvider>
  );
}
