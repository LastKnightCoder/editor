import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PluginPermission } from "@tau/plugins";
import { Button } from "@tau/ui";
import { usePluginPermissionUi, type DesktopPermissionBroker } from "@/app/plugins/permissions";
import type { DesktopDataAdapter } from "@/app/plugins/data";
import { PluginOperationsSection } from "./PluginOperationsSection";
import { PERMISSION_LABELS, PERMISSION_STATE_LABELS } from "./labels";

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
  useSyncExternalStore(broker?.subscribe ?? noop, broker?.getRevision ?? (() => 0));
  const pending = usePluginPermissionUi(state => state.pending[pluginId]);
  const [busy, setBusy] = useState<PluginPermission | null>(null);
  const [error, setError] = useState("");
  const usage = useQuery({
    queryKey: ["plugins", "permission-usage", pluginId],
    queryFn: () => (broker ? broker.usage(pluginId) : Promise.resolve(null)),
    enabled: Boolean(broker),
    refetchOnWindowFocus: true,
  });
  if (!broker) return <p className="text-tau-body text-ink-2">当前环境不支持插件访问业务数据。</p>;

  const act = async (permission: PluginPermission, run: () => Promise<void>) => {
    setBusy(permission);
    setError("");
    try {
      await run();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "授权修改失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-w-0">
      <p className="text-tau-meta text-ink-2 mb-4">
        插件首次使用这些数据时会询问你。插件与应用运行在同一环境中，并且可以联网，请只允许你信任的插件。
      </p>
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
                {waiting ? "等待你的允许" : PERMISSION_STATE_LABELS[state]}
              </span>
              {waiting ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === permission}
                    onClick={() => broker.dismissPending(pluginId, permission)}
                  >
                    忽略
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
                      仅这次
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
                    始终允许
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
                  始终允许
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={state === "blocked" ? "ghost" : "danger-soft"}
                  disabled={busy === permission}
                  onClick={() => act(permission, () => broker.reset(pluginId, permission))}
                >
                  {state === "blocked" ? "解除阻止" : "撤销"}
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
          最近 {usage.data.days} 天读取 {usage.data.read} 次 · 修改 {usage.data.write} 次 · 删除{" "}
          {usage.data.delete} 次
        </p>
      )}
      {data && <PluginOperationsSection data={data} pluginId={pluginId} />}
    </div>
  );
}
