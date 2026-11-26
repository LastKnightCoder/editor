import { usePublishExecutionI18n } from "../execution.i18n";
import { publishRunErrorText } from "../execution.binding";
/** 发布计划、执行反馈及站点摘要共用同一份提供方配置。 */

import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { Check, ChevronRight, ExternalLink, RotateCw, Upload } from "lucide-react";
import { Button, PanelAction, PanelNote, PanelTitle } from "@tau/ui";
import { EPublishProvider } from "@/stores/useSettingStore";
import type { IPublishProgress, PublishImageWarning } from "@/types/publish";
import { type PublishConfig } from "../usePublishConfig";
import type { PlanSummary, RunState } from "../usePublishRun";
import { formatAgo } from "@/utils/formatAgo";
import { formatDuration } from "./format";

/** 右栏一节：左右内距与纸左侧内容对称（右侧扣掉 FadeScroll 的 6px 滚动条透明边） */
function RailSection({ children }: { children: ReactNode }) {
  return <section className="py-5 pr-[26px] pl-8">{children}</section>;
}

/* ─────────────── 首次引导 ─────────────── */

export function GuideCard({
  config,
  selectionCount,
  onOpenSettings,
}: {
  config: PublishConfig;
  selectionCount: number;
  onOpenSettings: () => void;
}) {
  const { t } = usePublishExecutionI18n();
  const isLocal = config.active === EPublishProvider.Local;
  const credentialLabel = t("guide.configure");
  const steps = [
    ...(isLocal
      ? []
      : [
          {
            id: "configure",
            label: credentialLabel,
            done: config.credentialReady,
            action: { text: t("guide.configureAction"), run: onOpenSettings },
          },
        ]),
    {
      id: "target",
      label: t("guide.target"),
      done: config.targetReady && config.templateReady,
      action: { text: t("guide.settingsAction"), run: onOpenSettings },
    },
    { id: "select", label: t("guide.select"), done: selectionCount > 0 },
  ];

  return (
    <RailSection>
      <PanelTitle>{t("guide.title")}</PanelTitle>
      <div className="text-tau-sm text-ink-3 mt-0.5">
        {t("guide.hint", { count: steps.length })}
      </div>
      <ol className="mt-3 flex flex-col gap-2">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={clsx(
              "text-tau-meta flex items-center gap-2.5 rounded-[10px] px-3 py-2.5",
              step.done ? "bg-ok-soft" : "border-line-1 border"
            )}
          >
            <span
              className={clsx(
                "font-tau-mono grid size-5 flex-none place-items-center rounded-full text-[11px] font-semibold",
                step.done ? "bg-ok text-ink-inverse" : "bg-hover text-ink-2"
              )}
            >
              {step.done ? <Check size={12} strokeWidth={2.5} /> : i + 1}
            </span>
            {step.label}
            {!step.done && step.action && (
              <button
                type="button"
                className="text-tau-sm text-accent-text ml-auto font-medium hover:underline"
                onClick={step.action.run}
              >
                {step.action.text}
              </button>
            )}
          </li>
        ))}
      </ol>
    </RailSection>
  );
}

/* ─────────────── 发布计划 ─────────────── */

const FILE_PREVIEW_LIMIT = 6;

function ImageWarnings({ warnings = [] }: { warnings?: PublishImageWarning[] }) {
  const { t } = usePublishExecutionI18n();
  if (!warnings.length) return null;
  return (
    <details className="bg-warn-soft rounded-tau-sm mt-3 p-3">
      <summary className="text-tau-sm text-warn cursor-pointer font-medium">
        {t("images.count", { count: warnings.length })}
      </summary>
      <p className="text-tau-sm text-ink-2 mt-2">{t("images.hint")}</p>
      <ul className="text-tau-sm mt-2 flex max-h-64 flex-col gap-3 overflow-auto">
        {warnings.map(warning => (
          <li key={JSON.stringify([warning.content.key, warning.url])} className="min-w-0">
            <div className="text-ink-1 font-medium break-words">{warning.title}</div>
            <div className="text-ink-2 font-tau-mono mt-0.5 break-all select-text">
              {warning.url}
            </div>
            <div className="text-ink-3 mt-0.5">{warning.reason}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PlanRow({
  color,
  label,
  files,
  muted,
}: {
  color: string;
  label: string;
  files: string[];
  muted?: boolean;
}) {
  const { t } = usePublishExecutionI18n();
  const [open, setOpen] = useState(false);
  const expandable = files.length > 0;
  return (
    <>
      <button
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={() => setOpen(v => !v)}
        className={clsx(
          "text-tau-meta flex items-center gap-2.5 rounded-[7px] px-1.5 py-[5px] text-left",
          expandable ? "hover:bg-hover cursor-pointer" : "cursor-default"
        )}
      >
        <ChevronRight
          size={11}
          strokeWidth={2}
          className={clsx(
            "text-ink-3 w-2.5 flex-none transition-transform duration-150",
            open && "rotate-90",
            !expandable && "invisible"
          )}
        />
        <i className={clsx("size-2 flex-none rounded-[3px]", color)} />
        {label}
        <b
          className={clsx(
            "font-tau-mono ml-auto text-[12.5px] font-semibold",
            muted && "text-ink-3"
          )}
        >
          {files.length}
        </b>
      </button>
      {open && (
        <div className="font-tau-mono text-ink-2 mt-0.5 mb-1 ml-6 text-[11px] leading-[1.9]">
          {files.slice(0, FILE_PREVIEW_LIMIT).map(path => (
            <div key={path} className="truncate" title={path}>
              {path}
            </div>
          ))}
          {files.length > FILE_PREVIEW_LIMIT && (
            <div className="text-ink-3 font-tau">
              {t("plan.more", { count: files.length - FILE_PREVIEW_LIMIT })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function PlanCard({
  plan,
  loading,
  stale,
  isLocal,
  onRefresh,
}: {
  plan: PlanSummary | null;
  loading: boolean;
  stale: boolean;
  isLocal: boolean;
  onRefresh: () => void;
}) {
  const { t, locale } = usePublishExecutionI18n();
  const upload = plan?.upload.length ?? 0;
  const remove = isLocal ? 0 : (plan?.remove.length ?? 0);

  return (
    <RailSection>
      <PanelTitle>
        {t("plan.title")}
        <PanelNote>{isLocal ? t("plan.export") : t("plan.publish")}</PanelNote>
        <PanelAction onClick={onRefresh} disabled={loading}>
          <RotateCw size={12} strokeWidth={2} className={clsx("mr-1", loading && "animate-spin")} />
          {loading ? t("plan.calculating") : t("plan.refresh")}
        </PanelAction>
      </PanelTitle>

      {stale && !loading && (
        <div className="text-tau-micro text-warn mt-1.5">{t("plan.stale")}</div>
      )}

      {/* 比例条：上传 accent / 删除 danger，空计划为纯轨道 */}
      <div className="bg-track mt-3.5 mb-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {upload > 0 && <i className="bg-accent block h-full" style={{ flex: upload }} />}
        {remove > 0 && <i className="bg-danger block h-full" style={{ flex: remove }} />}
      </div>

      {plan ? (
        <div className="flex flex-col gap-0.5">
          <PlanRow
            color="bg-accent"
            label={isLocal ? t("plan.generate") : t("plan.upload")}
            files={plan.upload}
          />
          {!isLocal && (
            <PlanRow
              color="bg-danger"
              label={t("plan.delete")}
              files={plan.remove}
              muted={remove === 0}
            />
          )}
        </div>
      ) : (
        <div className="text-tau-sm text-ink-3 px-1.5">
          {loading ? t("plan.loading") : t("plan.empty")}
        </div>
      )}
      {plan && (
        <div className="text-tau-tiny text-ink-3 mt-2 px-1.5">
          {t("plan.calculated", { time: formatAgo(plan.computedAt, locale) })}
        </div>
      )}
      <ImageWarnings warnings={plan?.imageWarnings} />
    </RailSection>
  );
}

/* ─────────────── 发布动作 ─────────────── */

const PHASES: IPublishProgress["phase"][] = [
  "preparing",
  "uploading",
  "pushing",
  "deleting",
  "finishing",
];

function Steps({ phase }: { phase: IPublishProgress["phase"] | null }) {
  const { t } = usePublishExecutionI18n();
  const current = phase ? PHASES.indexOf(phase) : 0;
  return (
    <div className="mt-4 mb-3 flex">
      {PHASES.map((p, i) => {
        const done = i < current;
        const cur = i === current;
        return (
          <div
            key={p}
            className={clsx(
              "relative flex flex-1 flex-col items-center gap-1.5 text-[11px]",
              done ? "text-ink-2" : cur ? "text-accent-text font-medium" : "text-ink-3"
            )}
          >
            {i > 0 && (
              <span
                className={clsx(
                  "absolute left-[-50%] right-1/2 top-[5px] h-0.5",
                  done || cur ? "bg-accent" : "bg-track"
                )}
              />
            )}
            <span
              className={clsx(
                "relative z-[1] size-3 rounded-full",
                done && "bg-accent",
                cur && "bg-surface ring-accent animate-pulse ring-[2.5px] ring-inset",
                !done && !cur && "bg-track"
              )}
            />
            {t(`phase.${p}`)}
          </div>
        );
      })}
    </div>
  );
}

const BIG = "mt-3.5 h-10 w-full justify-center rounded-[11px] text-[14px]";

export function ActionCard({
  config,
  run,
  canPublish,
  onPublish,
  onReset,
  onOpenSettings,
  onVisit,
}: {
  config: PublishConfig;
  run: RunState;
  canPublish: boolean;
  onPublish: () => void;
  onReset: () => void;
  onOpenSettings: () => void;
  onVisit?: () => void;
}) {
  const { t, locale } = usePublishExecutionI18n();
  const isLocal = config.active === EPublishProvider.Local;
  const mode = isLocal ? "export" : "publish";
  const verb = t(`action.${mode}`);
  const hint = isLocal ? t("target.chooseDirectory") : config.providerLabel;

  if (run.kind === "running") {
    const { progress } = run;
    // 快照推送是一次性的，没有中间进度，用流动条代替百分比
    const pushing = progress?.phase === "pushing";
    const percent =
      progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <RailSection>
        <PanelTitle>
          {t(`action.${mode}.running`)}
          <PanelNote className="truncate">{hint}</PanelNote>
        </PanelTitle>
        <Steps phase={progress?.phase ?? null} />
        <div className="bg-track relative h-1.5 overflow-hidden rounded-full">
          {pushing ? (
            <i className="bg-accent animate-progress-flow absolute inset-y-0 block w-1/3 rounded-full" />
          ) : (
            <i
              className="bg-accent block h-full rounded-full transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          )}
        </div>
        <div className="text-tau-micro text-ink-3 mt-2 flex justify-between gap-3">
          <span className="font-tau-mono text-ink-2 truncate">
            {pushing
              ? t("progress.pushing", { count: progress.total })
              : (progress?.currentFile ?? (progress ? "" : t("progress.preparing")))}
          </span>
          {!pushing && progress && progress.total > 0 && (
            <span className="font-tau-mono flex-none">
              {progress.current} / {progress.total}
            </span>
          )}
        </div>
        <div className="text-tau-tiny text-ink-3 mt-3">{t("progress.keepOpen")}</div>
      </RailSection>
    );
  }

  if (run.kind === "done" || run.kind === "exported" || run.kind === "error") {
    let tone: "ok" | "warn" | "danger" = "ok";
    let title: ReactNode;
    let desc: ReactNode = null;
    let failures: { path: string; error: string }[] = [];
    const imageWarnings =
      run.kind === "done"
        ? run.result.imageWarnings
        : run.kind === "exported"
          ? run.imageWarnings
          : [];
    if (run.kind === "done") {
      const { result } = run;
      failures = result.failed;
      tone = result.success && failures.length === 0 && !imageWarnings?.length ? "ok" : "warn";
      title =
        failures.length === 0
          ? t("result.uploaded", { count: result.uploaded.length })
          : t("result.partial", { uploaded: result.uploaded.length, failed: failures.length });
      desc = [
        result.deleted.length > 0 && t("result.deleted", { count: result.deleted.length }),
        result.skipped.length > 0 && t("result.skipped", { count: result.skipped.length }),
      ]
        .filter(Boolean)
        .join(t("result.separator"));
    } else if (run.kind === "exported") {
      if (imageWarnings?.length) tone = "warn";
      title = t("result.exported");
      desc = <span className="font-tau-mono break-all">{run.targetDir}</span>;
    } else {
      tone = "danger";
      title = t(`action.${mode}.failed`);
      desc = publishRunErrorText(run);
    }

    return (
      <RailSection>
        <PanelTitle>
          {run.kind === "error" ? t(`action.${mode}.incomplete`) : t(`action.${mode}.done`)}
          {run.kind !== "error" && (
            <PanelNote>
              {t("result.timing", {
                time: formatAgo(run.finishedAt, locale),
                duration: formatDuration(run.duration, t),
              })}
            </PanelNote>
          )}
          <PanelAction onClick={onReset}>{t("result.collapse")}</PanelAction>
        </PanelTitle>
        <div
          className={clsx(
            "mt-3 flex items-start gap-3 rounded-[11px] p-3",
            tone === "ok" && "bg-ok-soft",
            tone === "warn" && "bg-warn-soft",
            tone === "danger" && "bg-danger-soft"
          )}
        >
          <span
            className={clsx(
              "text-ink-inverse grid size-[26px] flex-none place-items-center rounded-full text-[13px] font-semibold",
              tone === "ok" && "bg-ok",
              tone === "warn" && "bg-warn",
              tone === "danger" && "bg-danger"
            )}
          >
            {tone === "ok" ? <Check size={14} strokeWidth={2.5} /> : "!"}
          </span>
          <div className="min-w-0">
            <b className="text-[13px] font-semibold">{title}</b>
            {desc && <p className="text-tau-sm text-ink-2 mt-0.5">{desc}</p>}
          </div>
        </div>
        {failures.length > 0 && (
          <div className="font-tau-mono mt-2.5 max-h-40 overflow-auto text-[11px] leading-[1.8]">
            {failures.map(f => (
              <div key={f.path} className="flex gap-2">
                <span className="min-w-0 truncate" title={f.path}>
                  {f.path}
                </span>
                <span className="text-danger font-tau ml-auto flex-none" title={f.error}>
                  {f.error.length > 18 ? `${f.error.slice(0, 18)}…` : f.error}
                </span>
              </div>
            ))}
          </div>
        )}
        <ImageWarnings warnings={imageWarnings} />
        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={RotateCw}
            className="flex-1 justify-center"
            disabled={!canPublish}
            onClick={onPublish}
          >
            {t(`action.${mode}.retry`)}
          </Button>
          {onVisit && !isLocal && (
            <Button
              variant="secondary"
              size="sm"
              icon={ExternalLink}
              className="flex-1 justify-center"
              onClick={onVisit}
            >
              {t("visit")}
            </Button>
          )}
        </div>
      </RailSection>
    );
  }

  return (
    <RailSection>
      <PanelTitle>
        {isLocal ? t("target.local") : t("target.remote", { provider: config.providerLabel })}
      </PanelTitle>
      <div className="text-tau-sm text-ink-3 mt-0.5 truncate">{hint}</div>
      <Button
        variant="primary"
        icon={Upload}
        className={BIG}
        disabled={!canPublish}
        onClick={onPublish}
      >
        {verb}
      </Button>
      <div className="text-tau-micro text-ink-3 mt-2.5 flex items-center justify-between">
        <span>{isLocal ? t("target.localHint") : t("target.remoteHint")}</span>
        {!isLocal && (
          <button
            type="button"
            className="text-ink-2 hover:text-accent-text"
            onClick={onOpenSettings}
          >
            {t("connection.test")}
          </button>
        )}
      </div>
    </RailSection>
  );
}

/* ─────────────── 站点设置摘要 ─────────────── */

function SiteRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { t } = usePublishExecutionI18n();
  return (
    <div className="text-tau-sm flex items-baseline gap-3 py-[3px]">
      <span className="text-ink-3 w-14 flex-none">{label}</span>
      <span
        className={clsx(
          "min-w-0 flex-1 truncate text-right",
          value ? "text-ink-2" : "text-ink-3",
          mono && "font-tau-mono text-[11.5px]"
        )}
        title={value || undefined}
      >
        {value || t("site.unset")}
      </span>
    </div>
  );
}

export function SiteCard({ config, onOpen }: { config: PublishConfig; onOpen: () => void }) {
  const { t } = usePublishExecutionI18n();
  const rows: { id: string; label: string; value: string; mono?: boolean }[] = [
    { id: "target", label: t("site.target"), value: config.providerLabel },
    { id: "path", label: t("site.path"), value: config.basePath, mono: true },
    { id: "template", label: t("site.template"), value: config.templateName },
  ];

  return (
    <RailSection>
      <PanelTitle>
        {t("site.settings")}
        <PanelNote>{config.providerLabel}</PanelNote>
        <PanelAction onClick={onOpen}>
          {t("details")}
          <ChevronRight size={12} strokeWidth={2} className="ml-0.5" />
        </PanelAction>
      </PanelTitle>
      <div className="mt-2 flex flex-col">
        {rows.map(row => (
          <SiteRow key={row.id} {...row} />
        ))}
      </div>
    </RailSection>
  );
}
