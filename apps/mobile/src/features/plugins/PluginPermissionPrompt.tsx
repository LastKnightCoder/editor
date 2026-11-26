import { pluginControlsTranslator, usePluginControlsI18n } from "./controls.i18n";
import { useNavigator, useRouterContext } from "../../router";
import { useSyncExternalStore, useState, useEffect, useRef } from "react";
import type { PluginPermissionBroker, PermissionDecision } from "@tau/plugins/permission-host";
import { pluginPermission } from "./i18n";
import { ActionSheet } from "../../components/ActionSheet";
import { toast } from "../../components/toast";
const t = pluginControlsTranslator.t;

export function PluginPermissionPrompt({ broker }: { broker: PluginPermissionBroker }) {
  usePluginControlsI18n();
  useSyncExternalStore(broker.subscribe, broker.getSnapshot);
  const prompt = broker.prompts[0];
  const [answered, setAnswered] = useState<number | null>(null);
  const navigator = useNavigator();
  const router = useRouterContext();
  const promptId = prompt?.id;
  const latest = useRef<() => void>(() => undefined);
  const entry = navigator.getTopOverlay() ?? navigator.getActiveScreen();
  const entryId = entry?.id;
  useEffect(() => {
    if (!promptId || !entryId) return;
    return navigator.registerBackHandler(
      entryId,
      () => {
        latest.current();
        return true;
      },
      { blockEdgeBack: true }
    );
  }, [navigator, promptId, entryId, router]);
  if (!prompt) return null;
  const decide = (decision: PermissionDecision) => {
    if (answered === prompt.id) return;
    setAnswered(prompt.id);
    void prompt.decide(decision).catch(error => toast.error(String(error)));
  };
  latest.current = () => decide("deny");
  return (
    <ActionSheet
      backDismiss={false}
      key={prompt.id}
      open
      title={t("permission.mobileTitle", { name: prompt.plugin.name })}
      subtitle={t("permission.mobileNotice", {
        permissions: [...prompt.permissions].map(pluginPermission).join("、"),
      })}
      items={[
        {
          key: "once",
          label: t("permission.once"),
          desc: t("permission.onceHint"),
          onClick: () => decide("once"),
        },
        {
          key: "always",
          label: t("permission.always"),
          desc: t("permission.alwaysHint"),
          onClick: () => decide("always"),
        },
        { key: "deny", label: t("permission.deny"), onClick: () => decide("deny") },
      ]}
      onClose={() => decide("deny")}
    />
  );
}
