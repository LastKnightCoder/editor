import {
  pluginControlsTranslator,
  pluginControlsNumber,
  usePluginControlsI18n,
} from "../controls.i18n";
import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PluginPermission } from "@tau/plugins";
import { Button } from "@tau/ui";
import { usePluginPermissionUi, type DesktopPermissionBroker } from "@/app/plugins/permissions";
import type { DesktopDataAdapter } from "@/app/plugins/data";
import { PluginOperationsSection } from "./PluginOperationsSection";
import { PERMISSION_LABELS, PERMISSION_STATE_LABELS } from "./labels";
const t = pluginControlsTranslator.t;

const noop = () => () => undefined;

/** 插件详情页「权限」：声明的权限逐项显示状态，可授予、撤销或解除阻止，并显示近期调用次数。 */
export function PluginPermissionsTab({
  broker,
  data,
  pluginId,
  permissions,
  active,
}: {
  broker?: DesktopPermissionBroker;
  data?: DesktopDataAdapter;
  pluginId: string;
  permissions: readonly PluginPermission[];
  active: boolean;
}) {
  usePluginControlsI18n();
  useSyncExternalStore(broker?.subscribe ?? noop, broker?.getRevision ?? (() => 0));
  const pending = usePluginPermissionUi(state => state.pending[pluginId]);
  const [busy, setBusy] = useState<PluginPermission | null>(null);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const error = failure
    ? failure.cause instanceof Error
      ? failure.cause.message
      : t("permission.changeFailed")
    : "";
  const usage = useQuery({
    queryKey: ["plugins", "permission-usage", pluginId],
    queryFn: () => (broker ? broker.usage(pluginId) : Promise.resolve(null)),
    enabled: Boolean(broker),
    refetchOnWindowFocus: true,
  });
  if (!broker) return <p className="text-tau-body text-ink-2">{t("permission.unsupported")}</p>;

  const act = async (permission: PluginPermission, run: () => Promise<void>) => {
    setBusy(permission);
    setFailure(null);
    try {
      await run();
    } catch (cause) {
      setFailure({ cause });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-w-0">
      <p className="text-tau-meta text-ink-2 mb-4">{t("permission.introNotice")}</p>
      <div className="mb-5">
        {permissions.map(permission => {
          const state = broker.rowState(pluginId, permission);
          const waiting = pending?.includes(permission);
          const label = PERMISSION_LABELS[permission];
          return (
            <div
              key={permission}
              className="flex items-center gap-3 px-1 py-3 shadow-[0_1px_0_var(--tau-line-2)]"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-tau-body text-ink-1 font-medium">{label.label}</span>
                <span className="text-tau-meta text-ink-3">{label.detail}</span>
              </div>
              <span
                className={
                  waiting ? "text-tau-meta text-accent" : "text-tau-meta text-ink-2 tabular-nums"
                }
              >
                {waiting ? t("permission.waiting") : PERMISSION_STATE_LABELS[state]}
              </span>
              {waiting ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === permission}
                    onClick={() => broker.dismissPending(pluginId, permission)}
                  >
                    {t("permission.ignore")}
                  </Button>
                  {active && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === permission}
                      onClick={() =>
                        act(permission, () => broker.grant(pluginId, permission, "once"))
                      }
                    >
                      {t("permission.once")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={busy === permission}
                    onClick={() =>
                      act(permission, () => broker.grant(pluginId, permission, "always"))
                    }
                  >
                    {t("permission.always")}
                  </Button>
                </>
              ) : state === "none" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === permission}
                  onClick={() =>
                    act(permission, () => broker.grant(pluginId, permission, "always"))
                  }
                >
                  {t("permission.always")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={state === "blocked" ? "ghost" : "danger-soft"}
                  disabled={busy === permission}
                  onClick={() => act(permission, () => broker.reset(pluginId, permission))}
                >
                  {state === "blocked" ? t("permission.unblock") : t("permission.revoke")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-tau-meta text-danger mb-3">
          {error}
        </p>
      )}
      {usage.data && (
        <p className="text-tau-meta text-ink-3 tabular-nums">
          {t("permission.usage", {
            days: pluginControlsNumber(usage.data.days),
            read: pluginControlsNumber(usage.data.read),
            write: pluginControlsNumber(usage.data.write),
            delete: pluginControlsNumber(usage.data.delete),
          })}
        </p>
      )}
      {data && <PluginOperationsSection data={data} pluginId={pluginId} />}
    </div>
  );
}
