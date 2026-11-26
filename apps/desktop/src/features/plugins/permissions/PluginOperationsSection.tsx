import { pluginControlsTranslator, usePluginControlsI18n } from "../controls.i18n";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@tau/ui";
import type { DesktopDataAdapter } from "@/app/plugins/data";
import type { PluginOperationRecord } from "@/types/plugin-data";
import { usePluginEntityAppearances } from "@/services/plugin-entity-kinds";
const t = pluginControlsTranslator.t;

const ENTITY_NAMES: Record<PluginOperationRecord["entity"], string> = {
  get card() {
    return t("common.cards");
  },
  get article() {
    return t("common.articles");
  },
  get document() {
    return t("common.documents");
  },
  get whiteboard() {
    return t("common.whiteboards");
  },
  get project() {
    return t("create.project");
  },
  get todo() {
    return t("common.todos");
  },
  get event() {
    return t("common.schedule");
  },
  get "plugin-entity"() {
    return t("common.pluginContent");
  },
};

const timeLabel = (time: number, locale: string) =>
  new Date(time).toLocaleString(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** 插件详情页「最近删除」：插件 7 天内删除的内容，可逐条恢复 */
export function PluginOperationsSection({
  data,
  pluginId,
}: {
  data: DesktopDataAdapter;
  pluginId: string;
}) {
  const { locale } = usePluginControlsI18n();
  const client = useQueryClient();
  const key = ["plugins", "operations", pluginId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => data.operations(pluginId),
    refetchOnWindowFocus: true,
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const error = failure
    ? failure.cause instanceof Error
      ? failure.cause.message
      : t("operations.restoreFailed")
    : "";
  const appearanceOf = usePluginEntityAppearances();
  if (!query.data?.length) return null;

  const restore = async (operation: PluginOperationRecord) => {
    setBusy(operation.id);
    setFailure(null);
    try {
      await data.restore(operation);
    } catch (cause) {
      setFailure({ cause });
    } finally {
      setBusy(null);
      await client.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <section aria-label={t("operations.recent")} className="mt-6">
      <h3 className="text-tau-body text-ink-1 mb-1 font-semibold">{t("operations.recent")}</h3>
      <p className="text-tau-meta text-ink-3 mb-2">{t("operations.hint")}</p>
      {query.data.map(operation => (
        <div
          key={operation.id}
          className="flex items-center gap-3 px-1 py-2.5 shadow-[0_1px_0_var(--tau-line-2)]"
        >
          <span className="text-tau-meta text-ink-3 w-16 shrink-0 truncate">
            {appearanceOf(pluginId, operation.kind)?.label ?? ENTITY_NAMES[operation.entity]}
          </span>
          <span className="text-tau-body text-ink-1 min-w-0 flex-1 truncate">
            {operation.title || t("common.emptyTitle")}
          </span>
          <span className="text-tau-meta text-ink-3 tabular-nums">
            {timeLabel(operation.createdAt, locale)}
          </span>
          {operation.restoredAt ? (
            <span className="text-tau-meta text-ink-3">{t("operations.restored")}</span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => void restore(operation)}
            >
              {t("common.restore")}
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="text-tau-meta text-danger mt-2">
          {error}
        </p>
      )}
    </section>
  );
}
