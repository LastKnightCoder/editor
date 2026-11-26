import { pluginPermission } from "./i18n";
import {
  pluginControlsTranslator,
  pluginControlsNumber,
  usePluginControlsI18n,
} from "./controls.i18n";
import { useQuery } from "@tanstack/react-query";
import { useMobilePluginStatus } from "../../app/plugins/context";
import { useSyncExternalStore } from "react";
import type { PluginPermissionBroker } from "@tau/plugins/permission-host";
import type { PluginPermission } from "@tau/plugins";
import { describeCenterPermissions } from "@tau/plugins/center";
import { Button } from "@tau/ui";
import { toast } from "../../components/toast";
const t = pluginControlsTranslator.t;

export function PluginPermissionControls({
  broker,
  pluginId,
  pluginName,
  permissions,
  database,
}: {
  broker: PluginPermissionBroker;
  pluginId: string;
  database: string;
  pluginName: string;
  permissions: readonly string[];
}) {
  usePluginControlsI18n();
  useSyncExternalStore(broker.subscribe, broker.getSnapshot);
  const { reload } = useMobilePluginStatus();
  const usage = useQuery({
    queryKey: ["plugin-permission-usage", database, pluginId],
    queryFn: () => broker.usageFor(pluginId),
    refetchOnWindowFocus: true,
  });
  const states = broker.rowState(pluginId);
  const pending = broker.pendingFor(pluginId);
  return (
    <div className="bg-surface flex flex-col gap-3 rounded-2xl p-4">
      {usage.data && (
        <p className="text-ink-3 text-sm">
          {t("permission.usageSevenDays", {
            read: pluginControlsNumber(usage.data.read),
            write: pluginControlsNumber(usage.data.write),
            delete: pluginControlsNumber(usage.data.delete),
          })}
        </p>
      )}
      {broker.error != null && (
        <p role="alert" className="text-ink-3 text-sm">
          {t("permission.readFailed", { error: String(broker.error) })}
        </p>
      )}
      {broker.error != null && (
        <Button
          onClick={() =>
            void broker
              .recover()
              .then(reload)
              .catch(error => toast.error(String(error)))
          }
        >
          {t("permission.reset")}
        </Button>
      )}
      {describeCenterPermissions([...permissions]).map(item => {
        const permission = item.permission as PluginPermission;
        const state = states[permission];
        return (
          <div key={permission} className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <div>{pluginPermission(item.permission)}</div>
              <div className="text-ink-3">
                {state === "always"
                  ? t("permission.always")
                  : state === "once"
                    ? t("permission.allowedOnce")
                    : state === "blocked"
                      ? t("permission.blocked")
                      : pending.includes(permission)
                        ? t("permission.returnToPlugin")
                        : t("permission.ask")}
              </div>
            </div>
            {!state && pending.includes(permission) && (
              <Button
                onClick={() =>
                  void broker
                    .requestPending({ id: pluginId, name: pluginName }, permission)
                    .catch(error => toast.error(String(error)))
                }
              >
                {t("permission.handle")}
              </Button>
            )}
            {state && (
              <Button
                onClick={() =>
                  void broker.reset(pluginId, permission).catch(error => toast.error(String(error)))
                }
              >
                {state === "blocked" ? t("permission.unblock") : t("permission.revoke")}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
