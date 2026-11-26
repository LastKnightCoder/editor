import { SYSTEM_ACCESS_LABELS } from "../display";
import { pluginTranslator, pluginNumber, usePluginI18n } from "@/features/plugins/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@tau/ui";
import {
  getPluginBackend,
  grantPluginBackend,
  restartPluginBackend,
} from "@/commands/plugin-backend";
import useSettingStore from "@/stores/useSettingStore";
import type { BackendState } from "@tau/plugins/backend";
const t = pluginTranslator.t;

const labels: Record<BackendState, string> = {
  get stopped() {
    return t("backend.stopped");
  },
  get starting() {
    return t("backend.starting");
  },
  get running() {
    return t("backend.running");
  },
  get draining() {
    return t("backend.stopping");
  },
  get failed() {
    return t("backend.failed");
  },
  get blocked() {
    return t("backend.blocked");
  },
};

export function PluginBackendPanel({ pluginId }: { pluginId: string }) {
  usePluginI18n();
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
        {query.error instanceof Error ? query.error.message : t("backend.reading")}
      </p>
    );
  const error = action.error ?? query.error;
  return (
    <div className="text-tau-body space-y-4">
      <p className="text-ink-1">{data.backend.reason}</p>
      <p className="text-ink-2">{t("backend.notice")}</p>
      <dl className="text-ink-2 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
        <dt>{t("backend.reviewSource")}</dt>
        <dd>{data.systemReviewed ? t("backend.reviewed") : t("backend.unreviewed")}</dd>
        <dt>{t("detail.versions")}</dt>
        <dd>{data.version}</dd>
        <dt>{t("backend.state")}</dt>
        <dd>
          {labels[data.status.state]}
          {data.status.pid ? ` · ${data.status.pid}` : ""}
        </dd>
        <dt>{t("backend.scope")}</dt>
        <dd>
          {data.backend.scope === "application" ? t("backend.application") : t("backend.workspace")}
        </dd>
        <dt>{t("backend.activation")}</dt>
        <dd>
          {
            {
              "on-demand": t("backend.onDemand"),
              "app-ready": t("backend.appReady"),
              "workspace-ready": t("backend.workspaceReady"),
            }[data.backend.activation]
          }
        </dd>
        <dt>{t("backend.lifetime")}</dt>
        <dd>
          {data.backend.lifetime === "persistent" ? t("backend.persistent") : t("backend.idle")}
        </dd>
        <dt>{t("backend.purpose")}</dt>
        <dd>
          {data.backend.systemAccess.map(value => SYSTEM_ACCESS_LABELS[value]).join("、") ||
            t("install.systemDefault")}
        </dd>
      </dl>
      {data.status.diagnostics && (
        <p className="text-tau-meta text-ink-2">
          {t("backend.diagnostics", {
            startup: data.status.diagnostics.startupMs ?? "—",
            failures: pluginNumber(data.status.diagnostics.failures),
            timeouts: pluginNumber(data.status.diagnostics.timeouts),
          })}
        </p>
      )}
      {data.status.resources && (
        <p className="text-tau-meta text-ink-2">
          {t("backend.resources", {
            cpu: data.status.resources.cpuPercent.toFixed(1),
            memory: (data.status.resources.memoryKiB / 1024).toFixed(1),
          })}
        </p>
      )}
      {!data.enabled && <p className="text-ink-2">{t("backend.disabled")}</p>}
      {data.status.error && (
        <p role="alert" className="text-warn">
          {data.status.error}
        </p>
      )}
      {error && (
        <p role="alert" className="text-warn">
          {error instanceof Error ? error.message : t("common.actionFailed")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {data.authorized ? (
          <>
            <Button
              disabled={action.isPending || !data.enabled || data.executionAvailable === false}
              onClick={() => action.mutate("restart")}
            >
              {t("backend.restart")}
            </Button>
            <Button
              variant="danger-soft"
              disabled={action.isPending}
              onClick={() => action.mutate(null)}
            >
              {t("backend.revoke")}
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={action.isPending || data.executionAvailable === false}
              onClick={() => action.mutate("once")}
            >
              {t("backend.once")}
            </Button>
            <Button
              disabled={action.isPending || data.executionAvailable === false}
              onClick={() => action.mutate("always")}
            >
              {t("backend.always")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
