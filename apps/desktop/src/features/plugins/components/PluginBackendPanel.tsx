import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@tau/ui";
import {
  getPluginBackend,
  grantPluginBackend,
  restartPluginBackend,
} from "@/commands/plugin-backend";
import useSettingStore from "@/stores/useSettingStore";
import type { BackendState } from "@tau/plugins/backend";
import { SYSTEM_ACCESS_LABELS } from "../model";

const labels: Record<BackendState, string> = {
  stopped: "未运行",
  starting: "正在启动",
  running: "运行中",
  draining: "正在停止",
  failed: "运行失败",
  blocked: "等待授权",
};

export function PluginBackendPanel({ pluginId }: { pluginId: string }) {
  const workspace = useSettingStore(state => state.setting.database.active);
  const query = useQuery({
    queryKey: ["plugins", "backend", workspace, pluginId],
    queryFn: () => getPluginBackend(pluginId),
    refetchOnWindowFocus: true,
    refetchInterval: 3000,
  });
  const action = useMutation({
    mutationFn: async (decision: "once" | "always" | "restart" | null) => {
      if (!query.data) return;
      if (decision === "restart") await restartPluginBackend(pluginId);
      else await grantPluginBackend(pluginId, query.data.digest, decision);
    },
    onSettled: () => query.refetch(),
  });
  const data = query.data;
  if (!data)
    return (
      <p className="text-tau-body text-ink-2">
        {query.error instanceof Error ? query.error.message : "正在读取后台信息…"}
      </p>
    );
  const error = action.error ?? query.error;
  return (
    <div className="text-tau-body space-y-4">
      <p className="text-ink-1">{data.backend.reason}</p>
      <p className="text-ink-2">
        此插件包含本机后台代码，可使用当前用户的系统权限。独立进程不限制它对文件和网络的访问，请只允许你信任的插件。
      </p>
      <dl className="text-ink-2 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
        <dt>审核来源</dt>
        <dd>
          {data.systemReviewed
            ? "插件中心已完成此版本的系统能力审核"
            : "本地安装，未经插件中心系统能力审核"}
        </dd>
        <dt>版本</dt>
        <dd>{data.version}</dd>
        <dt>运行状态</dt>
        <dd>
          {labels[data.status.state]}
          {data.status.pid ? ` · ${data.status.pid}` : ""}
        </dd>
        <dt>运行范围</dt>
        <dd>{data.backend.scope === "application" ? "整个应用" : "当前工作区"}</dd>
        <dt>启动时机</dt>
        <dd>
          {
            {
              "on-demand": "使用时启动",
              "app-ready": "应用启动时",
              "workspace-ready": "工作区就绪时",
            }[data.backend.activation]
          }
        </dd>
        <dt>运行时间</dt>
        <dd>{data.backend.lifetime === "persistent" ? "保持运行至所属范围结束" : "空闲时回收"}</dd>
        <dt>系统用途</dt>
        <dd>
          {data.backend.systemAccess.map(value => SYSTEM_ACCESS_LABELS[value]).join("、") ||
            "系统信息与计算"}
        </dd>
      </dl>
      {data.status.diagnostics && (
        <p className="text-tau-meta text-ink-2">
          启动耗时 {data.status.diagnostics.startupMs ?? "—"} ms · 本次应用会话失败{" "}
          {data.status.diagnostics.failures} 次 · 调用超时 {data.status.diagnostics.timeouts} 次
        </p>
      )}
      {data.status.resources && (
        <p className="text-tau-meta text-ink-2">
          CPU {data.status.resources.cpuPercent.toFixed(1)}% · 内存{" "}
          {(data.status.resources.memoryKiB / 1024).toFixed(1)} MiB
        </p>
      )}
      {!data.enabled && <p className="text-ink-2">插件已停用，授权后仍需启用插件才能运行。</p>}
      {data.status.error && (
        <p role="alert" className="text-warn">
          {data.status.error}
        </p>
      )}
      {error && (
        <p role="alert" className="text-warn">
          {error instanceof Error ? error.message : "操作失败"}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {data.authorized ? (
          <>
            <Button
              disabled={action.isPending || !data.enabled || data.executionAvailable === false}
              onClick={() => action.mutate("restart")}
            >
              启动或重启后台
            </Button>
            <Button
              variant="danger-soft"
              disabled={action.isPending}
              onClick={() => action.mutate(null)}
            >
              撤销并停止
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={action.isPending || data.executionAvailable === false}
              onClick={() => action.mutate("once")}
            >
              仅本次允许运行
            </Button>
            <Button
              disabled={action.isPending || data.executionAvailable === false}
              onClick={() => action.mutate("always")}
            >
              允许此版本自动运行
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
