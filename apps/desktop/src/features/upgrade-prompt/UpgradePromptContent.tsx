import { useState, type ReactNode } from "react";
import { ChevronRight, ExternalLink, RotateCcw, ShieldCheck } from "lucide-react";
import { Button, cn } from "@tau/ui";
import type { UpgradePromptRequest } from "@tau/shared/upgrade-prompt";
import logo from "@/assets/logo.png";
import { openExternal } from "@/commands";
import { useSettingsStore } from "@/app/settingsStore";
import { useReleaseNotesStore } from "@/features/release-notes/releaseNotesStore";
import type { UpdateStatus } from "@/stores/useUpdateStore";
import { useUpgradePromptI18n, type UpgradePromptMessageKey } from "./i18n";
import {
  useResolvedUpgradeCopy,
  useUpgradePromptController,
  type ResolvedUpgradeCopy,
} from "./useUpgradePromptController";

function StatusBadge({ status, percent }: { status: UpdateStatus; percent: number }) {
  const { t } = useUpgradePromptI18n();
  const toneClass: Record<UpdateStatus, string> = {
    idle: "bg-hover text-ink-2",
    checking: "bg-accent-soft text-accent-text",
    available: "bg-accent-soft text-accent-text",
    downloading: "bg-accent-soft text-accent-text",
    ready: "bg-ok-soft text-ok",
    upToDate: "bg-warn-soft text-warn",
    error: "bg-danger-soft text-danger",
  };
  const label =
    status === "downloading"
      ? t("status.downloading", { percent })
      : t(`status.${status}` as UpgradePromptMessageKey);
  return (
    <span
      className={cn(
        "inline-flex h-[19px] flex-none items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap tabular-nums",
        toneClass[status]
      )}
    >
      {label}
    </span>
  );
}

/** 通用升级提示正文体：原因说明 + 轻量数据保护行 + 可选折叠对照 + 清透亮底实时更新卡。 */
export function UpgradePromptBody({
  request,
  copy,
  controller,
  embedded = false,
  onClose,
}: {
  request: UpgradePromptRequest;
  copy: ResolvedUpgradeCopy;
  controller: ReturnType<typeof useUpgradePromptController>;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const { t } = useUpgradePromptI18n();
  const [whyOpen, setWhyOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const {
    status,
    currentVersion,
    newVersion,
    downloadTarget,
    percent,
    errorMessage,
    releaseNotes,
  } = controller;

  const showVersionArrow =
    Boolean(newVersion) &&
    (status === "available" || status === "downloading" || status === "ready");
  const showManualDownload = status === "available" || status === "error";
  const subtitle =
    status === "error" && errorMessage
      ? errorMessage
      : t(`sub.${status}` as UpgradePromptMessageKey);

  return (
    <div className="text-ink-2 flex flex-col gap-3 text-[13px] leading-[1.65]">
      <p>{copy.description}</p>

      {copy.dataSafety && (
        <div className="text-ok text-tau-meta flex items-start gap-[7px] leading-[1.55]">
          <ShieldCheck className="mt-[2px] size-[15px] shrink-0" strokeWidth={1.9} aria-hidden />
          <span>{copy.dataSafety}</span>
        </div>
      )}

      {copy.explanation && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={whyOpen}
            onClick={() => setWhyOpen(v => !v)}
            className="text-ink-3 hover:text-ink-1 -my-1 -ml-1 inline-flex items-center gap-1 self-start rounded-[6px] px-1 py-0.5 text-[12px] transition-colors outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
          >
            <ChevronRight
              className={cn(
                "size-[13px] shrink-0 transition-transform duration-150",
                whyOpen && "rotate-90"
              )}
              strokeWidth={1.9}
            />
            <span>{copy.explanation.triggerLabel}</span>
          </button>
          {whyOpen && (
            <div className="bg-surface border-line-1 flex flex-col gap-2 rounded-[11px] border px-3 py-2.5 text-[12px]">
              {copy.explanation.rows.map((row, index) => (
                <div
                  key={`${row.label}-${index}`}
                  className="grid grid-cols-[68px_1fr] items-baseline gap-2.5"
                >
                  <span className="text-ink-3 text-[11.5px] font-medium">{row.label}</span>
                  <span className="text-ink-1 leading-[1.5]">{row.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {request.rawError && request.critical && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen(v => !v)}
            className="text-ink-3 hover:text-ink-1 -my-1 -ml-1 inline-flex items-center gap-1 self-start rounded-[6px] px-1 py-0.5 text-[12px] transition-colors outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
          >
            <ChevronRight
              className={cn(
                "size-[13px] shrink-0 transition-transform duration-150",
                detailsOpen && "rotate-90"
              )}
              strokeWidth={1.9}
            />
            <span>{t("meta.details")}</span>
          </button>
          {detailsOpen && (
            <pre className="bg-surface border-line-1 text-ink-2 font-tau-mono max-h-[120px] overflow-auto rounded-[10px] border px-3 py-2 text-[11.5px] leading-relaxed break-words whitespace-pre-wrap">
              {request.rawError}
            </pre>
          )}
        </div>
      )}

      {/* 内嵌更新状态卡：清透亮底 + line-1 细描边，避免深色米黄块压重画面 */}
      <div className="border-line-1 rounded-tau-md flex flex-col gap-2.5 border bg-[color-mix(in_srgb,var(--tau-bg-page)_22%,var(--tau-bg-surface))] px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-accent-soft flex size-[34px] shrink-0 items-center justify-center rounded-[10px]">
            <img
              src={logo}
              alt="Tau"
              draggable={false}
              className="size-[22px] mix-blend-multiply select-none dark:mix-blend-normal dark:brightness-90"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-ink-1 flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold">
              <span className="font-tau-mono tabular-nums">
                {currentVersion ? `v${currentVersion}` : t("meta.unknownVersion")}
              </span>
              {showVersionArrow && newVersion && (
                <>
                  <span className="text-ink-3 font-normal" aria-hidden>
                    →
                  </span>
                  <span className="font-tau-mono tabular-nums">v{newVersion}</span>
                </>
              )}
              <StatusBadge status={status} percent={percent} />
            </div>
            <div className="text-ink-2 mt-0.5 text-[11.5px] leading-[1.45]">{subtitle}</div>
          </div>
        </div>

        {status === "downloading" && (
          <div className="bg-hover h-[5px] overflow-hidden rounded-full">
            <div
              className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}

        {(releaseNotes.length > 0 || showManualDownload || !embedded) && (
          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[12px]">
            {releaseNotes.length > 0 && newVersion && (
              <button
                type="button"
                onClick={() =>
                  useReleaseNotesStore.getState().show(releaseNotes, {
                    updateAction: status === "available" || status === "ready",
                  })
                }
                className="text-accent-text inline-flex items-center gap-1 font-medium whitespace-nowrap hover:underline"
              >
                {t("action.viewNotes", { version: newVersion })}
              </button>
            )}
            {showManualDownload && (
              <button
                type="button"
                onClick={() => void openExternal(downloadTarget)}
                className="text-ink-2 hover:text-ink-1 inline-flex items-center gap-1 whitespace-nowrap transition-colors"
              >
                <span>{t("action.manualDownload")}</span>
                <ExternalLink className="size-3 shrink-0" strokeWidth={1.75} />
              </button>
            )}
            {!embedded && (
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  useSettingsStore.getState().openSettings("app");
                }}
                className="text-ink-2 hover:text-ink-1 ml-auto inline-flex items-center whitespace-nowrap transition-colors"
              >
                {t("action.openAbout")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 通用升级提示底栏：左侧脱困动作或版本提示，右侧次动作 + 单一 primary 主动作。 */
export function UpgradePromptFooter({
  request,
  controller,
  onClose,
  onRetry,
}: {
  request: UpgradePromptRequest;
  controller: ReturnType<typeof useUpgradePromptController>;
  onClose?: () => void;
  onRetry?: () => void;
}): ReactNode {
  const { t } = useUpgradePromptI18n();
  const { status, primaryButton, triggerPrimary } = controller;

  const secondaryCloseLabel =
    status === "downloading" ? t("action.backgroundDownload") : t("action.later");

  return (
    <div className="flex w-full items-center gap-2">
      <div className="text-ink-3 flex min-w-0 flex-1 items-center gap-1.5 text-[12px]">
        {request.secondaryAction ? (
          <button
            type="button"
            onClick={() => {
              request.secondaryAction?.onClick();
              onClose?.();
            }}
            className="text-ink-2 hover:text-ink-1 inline-flex items-center gap-1.5 rounded-[6px] py-0.5 text-[12px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
          >
            <RotateCcw className="size-[13px] shrink-0" strokeWidth={1.9} />
            <span>{request.secondaryAction.label}</span>
          </button>
        ) : request.minAppVersion ? (
          <span className="truncate tabular-nums">
            {t("meta.requireVersion", { version: request.minAppVersion })}
          </span>
        ) : null}
      </div>

      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("action.retryConnect")}
        </Button>
      ) : !request.critical && onClose ? (
        <Button variant="secondary" size="sm" onClick={onClose}>
          {secondaryCloseLabel}
        </Button>
      ) : null}

      <Button
        variant="primary"
        size="sm"
        icon={primaryButton.icon}
        loading={primaryButton.loading}
        loadingText={primaryButton.loadingText}
        onClick={triggerPrimary}
      >
        {primaryButton.label}
      </Button>
    </div>
  );
}

/** 嵌入式通用升级卡片（用于启动阶段数据库模型不兼容等无主壳层场景）。 */
export function UpgradePromptCard({
  request,
  onRetry,
}: {
  request: UpgradePromptRequest;
  onRetry?: () => void;
}) {
  const copy = useResolvedUpgradeCopy(request);
  const controller = useUpgradePromptController({ active: true, embedded: true });

  return (
    <div
      role="alertdialog"
      aria-label={copy.title}
      className="bg-surface border-line-1 shadow-card rounded-tau-lg flex w-[468px] max-w-[calc(100vw-2rem)] flex-col border"
    >
      <div className="flex flex-wrap items-center gap-2 px-6 pt-[22px]">
        <h2 className="text-ink-1 text-[16px] leading-[1.45] font-[650] tracking-[-0.01em]">
          {copy.title}
        </h2>
        {request.context && (
          <span className="border-line-1 bg-surface text-ink-2 inline-flex h-[22px] max-w-[176px] shrink-0 items-center gap-[5px] truncate rounded-full border px-2.5 text-[11px]">
            <span className="bg-accent size-[6px] shrink-0 rounded-full" />
            {request.context}
          </span>
        )}
      </div>
      <div className="px-6 pt-3 pb-[18px]">
        <UpgradePromptBody request={request} copy={copy} controller={controller} embedded />
      </div>
      <div className="border-line-2 border-t px-6 py-[13px]">
        <UpgradePromptFooter request={request} controller={controller} onRetry={onRetry} />
      </div>
    </div>
  );
}
