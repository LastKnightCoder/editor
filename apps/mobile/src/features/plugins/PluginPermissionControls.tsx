import { useQuery } from "@tanstack/react-query";
import { useMobilePluginStatus } from "../../app/plugins/context";
import { useSyncExternalStore } from "react";
import type { PluginPermissionBroker } from "@tau/plugins/permission-host";
import type { PluginPermission } from "@tau/plugins";
import { describeCenterPermissions } from "@tau/plugins/center";
import { Button } from "@tau/ui";
import { toast } from "../../components/toast";

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
          最近七天调用：读取 {usage.data.read} · 写入 {usage.data.write} · 删除 {usage.data.delete}
        </p>
      )}
      {broker.error != null && (
        <p role="alert" className="text-ink-3 text-sm">
          授权记录读取失败，未放行业务访问：{String(broker.error)}
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
          备份并重置此设备的插件授权
        </Button>
      )}
      {describeCenterPermissions([...permissions]).map(item => {
        const permission = item.permission as PluginPermission;
        const state = states[permission];
        return (
          <div key={permission} className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <div>{item.label}</div>
              <div className="text-ink-3">
                {state === "always"
                  ? "始终允许"
                  : state === "once"
                    ? "本次允许"
                    : state === "blocked"
                      ? "已阻止"
                      : pending.includes(permission)
                        ? "返回插件后重新申请"
                        : "使用时询问"}
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
                处理申请
              </Button>
            )}
            {state && (
              <Button
                onClick={() =>
                  void broker.reset(pluginId, permission).catch(error => toast.error(String(error)))
                }
              >
                {state === "blocked" ? "解除阻止" : "撤销"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
