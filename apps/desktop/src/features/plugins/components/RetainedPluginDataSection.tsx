import { useState, type RefObject } from "react";
import { ChevronDown, Database, Lock, Package } from "lucide-react";
import { Button, ConfirmDialog, cn, toast } from "@tau/ui";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import type { PluginCatalogEntry } from "@/types/plugin-center";
import type { RetainedPluginData } from "@/types/plugin-retained-data";
import { pluginCount, pluginTranslator, usePluginI18n } from "@/features/plugins/i18n";
import { matchesQuery } from "../model";
import { usePurgeRetainedPluginData } from "../queries";
import { PluginIcon } from "./PluginIcon";

const t = pluginTranslator.t;

interface DataFact {
  key: "entities" | "records" | "kv" | "secrets" | "other";
  label: string;
  text: string;
  synced: boolean;
}

function listSeparator(locale: string): string {
  return locale.startsWith("zh") ? "、" : ", ";
}

function buildDataFacts(item: RetainedPluginData, locale: string): DataFact[] {
  const facts: DataFact[] = [];
  if (item.entities > 0) {
    const text = item.entityKinds.length
      ? pluginCount("retained.entitiesWithKinds", item.entities, {
          kinds: item.entityKinds.join(listSeparator(locale)),
        })
      : pluginCount("retained.entitiesCount", item.entities);
    facts.push({
      key: "entities",
      label: t("retained.labelEntities"),
      text,
      synced: true,
    });
  }
  if (item.records > 0) {
    facts.push({
      key: "records",
      label: t("retained.labelRecords"),
      text: pluginCount("retained.recordsCount", item.records),
      synced: true,
    });
  }
  if (item.kv > 0) {
    facts.push({
      key: "kv",
      label: t("retained.labelSettings"),
      text: pluginCount("retained.kvCount", item.kv),
      synced: true,
    });
  }
  if (item.secrets > 0) {
    facts.push({
      key: "secrets",
      label: t("retained.labelSecrets"),
      text: pluginCount("retained.secretsCount", item.secrets),
      synced: false,
    });
  }
  if (!facts.length && item.other > 0) {
    facts.push({
      key: "other",
      label: t("retained.labelOther"),
      text: t("retained.otherState"),
      synced: true,
    });
  }
  return facts;
}

export function RetainedPluginDataSection({
  runtime,
  items,
  catalog,
  query,
  loading,
  error,
  onRetry,
  open,
  onOpenChange,
  highlighted,
  onOpenDetail,
  sectionRef,
}: {
  runtime: DesktopPluginRuntime;
  items: readonly RetainedPluginData[];
  catalog: readonly PluginCatalogEntry[];
  query: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlighted: boolean;
  onOpenDetail: (pluginId: string) => void;
  sectionRef?: RefObject<HTMLElement | null>;
}) {
  const { locale } = usePluginI18n();
  const purge = usePurgeRetainedPluginData(runtime);
  const [confirmTarget, setConfirmTarget] = useState<RetainedPluginData | null>(null);
  const [clearError, setClearError] = useState("");

  if (!runtime.canManageRetainedData) return null;

  const catalogById = new Map(catalog.map(entry => [entry.pluginId, entry]));
  const nameOf = (item: RetainedPluginData) =>
    catalogById.get(item.pluginId)?.name ?? item.pluginId;
  const filtered = items.filter(item =>
    matchesQuery([item.pluginId, catalogById.get(item.pluginId)?.name, ...item.entityKinds], query)
  );
  const autoExpanded = Boolean(query.trim()) && filtered.length > 0;
  const expanded = open || autoExpanded;

  if (!items.length && !open && !error) return null;

  const sep = listSeparator(locale);
  const previewNames = items.slice(0, 3).map(nameOf).join(sep);
  const lead = error
    ? error
    : items.length === 0
      ? t("retained.empty")
      : items.length > 3
        ? pluginCount("retained.summaryMore", items.length, { names: previewNames })
        : t("retained.summary", { names: previewNames });

  const targetName = confirmTarget ? nameOf(confirmTarget) : "";
  const targetFacts = confirmTarget ? buildDataFacts(confirmTarget, locale) : [];
  const targetHasWorkspaceData = targetFacts.some(fact => fact.synced);
  const targetHasSecrets = targetFacts.some(fact => !fact.synced);

  return (
    <>
      <section
        ref={sectionRef}
        className={cn(
          "border-line-1 ease-tau-out mb-6 overflow-hidden rounded-[var(--tau-radius-lg)] border transition-[border-color,box-shadow] duration-[160ms]",
          highlighted && "border-accent shadow-[var(--tau-focus-ring)]"
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onOpenChange(!expanded)}
          className="hover:bg-hover flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-[140ms] focus-visible:shadow-[var(--tau-focus-ring)] focus-visible:outline-none"
        >
          <span
            aria-hidden
            className="bg-hover text-ink-2 grid size-8 flex-none place-items-center rounded-[9px]"
          >
            <Database className="size-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-ink-1 text-[13.5px] font-semibold">{t("retained.title")}</span>
              {items.length > 0 && (
                <span className="bg-hover text-ink-2 text-tau-sm inline-flex h-5 items-center rounded-full px-2 tabular-nums">
                  {items.length}
                </span>
              )}
              {runtime.workspaceName && (
                <span className="border-line-1 bg-surface text-ink-2 text-tau-sm inline-flex h-5 items-center rounded-full border px-2">
                  {runtime.workspaceName}
                </span>
              )}
            </span>
            <span
              className={cn(
                "text-tau-meta mt-0.5 block truncate",
                error ? "text-danger" : "text-ink-2"
              )}
            >
              {lead}
            </span>
          </span>
          <span className="text-tau-meta text-ink-2 flex flex-none items-center gap-1.5">
            <span>{expanded ? t("retained.collapse") : t("retained.expand")}</span>
            <ChevronDown
              className={cn(
                "ease-tau-out size-4 transition-transform duration-[180ms]",
                expanded && "rotate-180"
              )}
              strokeWidth={1.75}
              aria-hidden
            />
          </span>
        </button>

        {expanded && (
          <div className="px-1.5 pb-2">
            {error ? (
              <div className="flex items-center justify-between gap-3 px-3 py-3">
                <p role="alert" className="text-tau-meta text-danger min-w-0 flex-1">
                  {error}
                </p>
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : loading && items.length === 0 ? (
              <p className="text-tau-meta text-ink-3 px-3 py-4 text-center">
                {t("center.loading")}
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-tau-meta text-ink-3 px-3 py-5 text-center">
                {query.trim() ? t("retained.noMatch") : t("retained.empty")}
              </p>
            ) : (
              <>
                <p className="text-tau-meta text-ink-3 px-3 pt-1 pb-2">{t("retained.note")}</p>
                {filtered.map(item => {
                  const entry = catalogById.get(item.pluginId);
                  const facts = buildDataFacts(item, locale);
                  return (
                    <div
                      key={item.pluginId}
                      className="hover:bg-hover flex min-h-[60px] items-center gap-3.5 rounded-[10px] px-3 py-2.5"
                    >
                      {entry ? (
                        <span className="opacity-80">
                          <PluginIcon id={item.pluginId} name={entry.name} size="sm" />
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className="bg-hover text-ink-2 grid size-8 flex-none place-items-center rounded-[9px]"
                        >
                          <Package className="size-4" strokeWidth={1.75} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "font-medium",
                              entry ? "text-[13.5px]" : "font-tau-mono text-[13px]"
                            )}
                          >
                            {entry ? entry.name : item.pluginId}
                          </span>
                          {entry ? (
                            <span className="font-tau-mono text-tau-sm text-ink-3">
                              {item.pluginId}
                            </span>
                          ) : (
                            <span className="bg-hover text-ink-2 text-tau-sm inline-flex h-5 items-center rounded-full px-2">
                              {t("retained.unlisted")}
                            </span>
                          )}
                          {item.updatedAt !== null && (
                            <span className="text-tau-sm text-ink-3 tabular-nums">
                              {t("retained.updatedAt", {
                                date: new Date(item.updatedAt).toLocaleDateString(locale),
                              })}
                            </span>
                          )}
                        </div>
                        <div className="text-tau-meta text-ink-2 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {facts.map((fact, index) => (
                            <span key={fact.key} className="inline-flex items-center gap-2">
                              {index > 0 && (
                                <span aria-hidden className="text-ink-3 select-none">
                                  ·
                                </span>
                              )}
                              {fact.synced ? (
                                <span className="tabular-nums">{fact.text}</span>
                              ) : (
                                <span
                                  className="bg-warn-soft text-warn text-tau-sm inline-flex h-5 items-center gap-1 rounded-full px-2 tabular-nums"
                                  title={t("retained.localOnlyHint")}
                                >
                                  <Lock className="size-3" strokeWidth={1.75} aria-hidden />
                                  {fact.text}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-none items-center gap-2">
                        {entry && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenDetail(item.pluginId)}
                          >
                            {t("center.details")}
                          </Button>
                        )}
                        <Button
                          variant="danger-soft"
                          size="sm"
                          onClick={() => {
                            setClearError("");
                            setConfirmTarget(item);
                          }}
                        >
                          {t("retained.clear")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        onOpenChange={next => {
          if (!next) {
            setConfirmTarget(null);
            setClearError("");
          }
        }}
        danger
        title={t("retained.clearTitle", { name: targetName })}
        context={
          confirmTarget
            ? runtime.workspaceName
              ? `${runtime.workspaceName} · ${confirmTarget.pluginId}`
              : confirmTarget.pluginId
            : undefined
        }
        description={
          confirmTarget ? (
            <div className="flex flex-col gap-3">
              <p>
                {targetHasSecrets ? t("retained.clearIntroWithSecrets") : t("retained.clearIntro")}
              </p>
              <dl className="border-line-1 flex flex-col gap-1.5 rounded-[12px] border px-3 py-2.5">
                {targetFacts.map(fact => (
                  <div
                    key={fact.key}
                    className="text-tau-meta flex items-center justify-between gap-3"
                  >
                    <dt className="text-ink-2 flex items-center gap-1.5">
                      <span>{fact.label}</span>
                      {!fact.synced && (
                        <span className="bg-warn-soft text-warn inline-flex h-[18px] items-center rounded-full px-1.5 text-[11px]">
                          {t("retained.localOnly")}
                        </span>
                      )}
                    </dt>
                    <dd className="text-ink-1 font-medium tabular-nums">{fact.text}</dd>
                  </div>
                ))}
              </dl>
              {clearError && (
                <p role="alert" className="text-tau-meta text-danger">
                  {clearError}
                </p>
              )}
            </div>
          ) : null
        }
        impact={targetHasWorkspaceData ? t("retained.impactSynced") : t("retained.impactLocalOnly")}
        confirmText={t("retained.confirmClear")}
        loadingText={t("retained.clearing")}
        onConfirm={async () => {
          if (!confirmTarget) return;
          setClearError("");
          const pluginId = confirmTarget.pluginId;
          const label = nameOf(confirmTarget);
          try {
            await purge.mutateAsync(pluginId);
            toast.success(t("retained.clearedToast", { name: label }));
          } catch (cause) {
            setClearError(cause instanceof Error ? cause.message : t("retained.clearFailed"));
            throw cause;
          }
        }}
      />
    </>
  );
}
