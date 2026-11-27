import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronRight,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { Button, cn } from "@tau/ui";
import {
  APP_DOWNLOAD_URL,
  type UpgradePromptExplanation,
  type UpgradePromptRequest,
} from "@tau/shared/upgrade-prompt";
import appIcon from "../../../src-tauri/icons/128x128@2x.png";
import { BottomSheet } from "../../components/BottomSheet";
import { useMobileUpgradePromptStore } from "../../app/upgradePromptStore";
import { supportsInAppUpdate, useAppUpdate } from "../settings/about/appUpdate";
import { formatUpdateSize } from "../settings/about/format";
import { updateErrorText } from "../settings/about/i18n";
import { useAppVersion } from "../settings/about/useAppVersion";
import { useMobileUpgradePromptI18n, type MobileUpgradePromptMessageKey } from "./i18n";

function useResolvedMobileCopy(request: UpgradePromptRequest) {
  const { t } = useMobileUpgradePromptI18n();
  const reason = request.reason;
  const title = request.title ?? t(`reason.${reason}.title` as MobileUpgradePromptMessageKey);
  const description =
    request.description ??
    (reason === "plugin-min-version" && request.minAppVersion
      ? t("reason.plugin-min-version.descriptionWithVersion", { version: request.minAppVersion })
      : t(`reason.${reason}.description` as MobileUpgradePromptMessageKey));
  const dataSafety =
    request.dataSafety ?? t(`reason.${reason}.safety` as MobileUpgradePromptMessageKey);
  const explanation: UpgradePromptExplanation | null = (() => {
    if (request.explanation) return request.explanation;
    if (reason === "calendar-timezone-write") {
      return {
        triggerLabel: t("reason.calendar-timezone-write.explainTrigger"),
        rows: [
          {
            label: t("reason.calendar-timezone-write.explainRow1Label"),
            text: t("reason.calendar-timezone-write.explainRow1Text"),
          },
          {
            label: t("reason.calendar-timezone-write.explainRow2Label"),
            text: t("reason.calendar-timezone-write.explainRow2Text"),
          },
        ],
      };
    }
    return null;
  })();
  return { title, description, dataSafety, explanation };
}

function UpgradePromptBody({
  request,
  active,
  onClose,
  onRetry,
}: {
  request: UpgradePromptRequest;
  active: boolean;
  onClose?: () => void;
  onRetry?: () => void;
}) {
  const { t, locale } = useMobileUpgradePromptI18n();
  const copy = useResolvedMobileCopy(request);
  const inApp = supportsInAppUpdate();
  const appVersion = useAppVersion();
  const { phase, check, progress, error, checkForUpdate, download, install } = useAppUpdate();
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    if (!active || !inApp) return;
    if (useAppUpdate.getState().phase === "idle") {
      void useAppUpdate.getState().checkForUpdate();
    }
  }, [active, inApp]);

  const currentVersion = check?.currentVersion ?? appVersion;
  const nextVersion = check?.available ? check.latest.version : null;
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : 0;

  const badge = (() => {
    if (!inApp) return { tone: "bg-accent-soft text-accent-text", text: t("status.external") };
    if (error && phase === "idle")
      return { tone: "bg-danger-soft text-danger", text: t("status.error") };
    switch (phase) {
      case "ready":
        return { tone: "bg-ok-soft text-ok", text: t("status.ready") };
      case "available":
        return { tone: "bg-accent-soft text-accent-text", text: t("status.available") };
      case "downloading":
        return { tone: "bg-accent-soft text-accent-text", text: t("status.downloading") };
      case "checking":
        return { tone: "bg-accent-soft text-accent-text", text: t("status.checking") };
      case "latest":
        return { tone: "bg-warn-soft text-warn", text: t("status.latest") };
      default:
        return { tone: "bg-hover text-ink-2", text: t("status.idle") };
    }
  })();

  const subtitle = (() => {
    if (!inApp) return t("sub.external");
    if (error) return updateErrorText(error);
    switch (phase) {
      case "checking":
        return t("sub.checking");
      case "available":
        return check?.latest.size
          ? t("sub.available", { size: formatUpdateSize(check.latest.size, locale) })
          : t("sub.availableNoSize");
      case "downloading":
        return progress && progress.total > 0
          ? t("sub.downloading", {
              received: formatUpdateSize(progress.received, locale),
              total: formatUpdateSize(progress.total, locale),
            })
          : t("sub.downloadingUnknown");
      case "ready":
        return t("sub.ready");
      case "latest":
        return t("sub.latest");
      default:
        return t("sub.idle");
    }
  })();

  const primaryAction = (() => {
    if (!inApp) {
      return {
        label: t("action.openWebsite"),
        icon: ExternalLink,
        loading: false,
        run: () => void openUrl(APP_DOWNLOAD_URL).catch(() => undefined),
      };
    }
    if (phase === "ready") {
      return {
        label: t("action.install"),
        icon: RotateCw,
        loading: false,
        run: () => void install(),
      };
    }
    if (phase === "available") {
      return {
        label: t("action.download"),
        icon: Download,
        loading: false,
        run: () => void download(),
      };
    }
    if (phase === "downloading") {
      return {
        label: t("action.downloading"),
        icon: undefined,
        loading: true,
        run: () => undefined,
      };
    }
    if (phase === "checking") {
      return {
        label: t("action.checking"),
        icon: undefined,
        loading: true,
        run: () => undefined,
      };
    }
    if (phase === "latest") {
      return {
        label: t("action.openWebsite"),
        icon: ExternalLink,
        loading: false,
        run: () => void openUrl(APP_DOWNLOAD_URL).catch(() => undefined),
      };
    }
    return {
      label: error ? t("action.retryCheck") : t("action.checkUpdate"),
      icon: RefreshCw,
      loading: false,
      run: () => void checkForUpdate(),
    };
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-ink-1 text-[16px] leading-[1.4] font-bold">{copy.title}</h2>
        {request.context && (
          <span className="border-line-1 bg-surface text-ink-2 inline-flex h-[22px] max-w-[180px] items-center gap-1.5 truncate rounded-full border px-2.5 text-[11px]">
            <span className="bg-accent size-[6px] shrink-0 rounded-full" />
            {request.context}
          </span>
        )}
      </div>

      <p className="text-ink-2 text-[13px] leading-relaxed">{copy.description}</p>

      {copy.dataSafety && (
        <div className="text-ok flex items-start gap-2 text-[12.5px] leading-relaxed">
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
            className="text-ink-3 -my-1 -ml-1 inline-flex items-center gap-1 self-start rounded-md px-1 py-0.5 text-[12px]"
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
            <div className="bg-surface border-line-1 flex flex-col gap-2 rounded-xl border px-3 py-2.5 text-[12px]">
              {copy.explanation.rows.map((row, index) => (
                <div
                  key={`${row.label}-${index}`}
                  className="grid grid-cols-[64px_1fr] items-baseline gap-2"
                >
                  <span className="text-ink-3 text-[11.5px] font-medium">{row.label}</span>
                  <span className="text-ink-1 leading-relaxed">{row.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="border-line-1 flex flex-col gap-2.5 rounded-xl border bg-[color-mix(in_srgb,var(--tau-bg-page)_22%,var(--tau-bg-surface))] px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <img
            src={appIcon}
            alt="Tau"
            className="size-[34px] shrink-0 rounded-[10px]"
            draggable={false}
          />
          <div className="min-w-0 flex-1">
            <div className="text-ink-1 flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold">
              <span className="font-tau-mono tabular-nums">
                {currentVersion ? `v${currentVersion}` : t("meta.unknownVersion")}
              </span>
              {inApp && nextVersion && (
                <>
                  <span className="text-ink-3 font-normal" aria-hidden>
                    →
                  </span>
                  <span className="font-tau-mono tabular-nums">v{nextVersion}</span>
                </>
              )}
              <span
                className={cn(
                  "inline-flex h-[18px] items-center rounded-full px-2 text-[10.5px] font-medium whitespace-nowrap",
                  badge.tone
                )}
              >
                {badge.text}
              </span>
            </div>
            <div className="text-ink-2 mt-0.5 text-[11.5px] leading-snug">{subtitle}</div>
          </div>
        </div>
        {inApp && phase === "downloading" && (
          <div className="bg-hover h-[5px] overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      <div className="mt-1 flex flex-col gap-2">
        <Button
          variant="primary"
          block
          icon={primaryAction.icon}
          loading={primaryAction.loading}
          loadingText={primaryAction.label}
          className="h-10 rounded-xl text-[14px]"
          onClick={primaryAction.run}
        >
          {primaryAction.label}
        </Button>

        {(request.secondaryAction || onRetry || (!request.critical && onClose)) && (
          <div className="flex gap-2">
            {request.secondaryAction && (
              <Button
                variant="secondary"
                icon={RotateCcw}
                className="h-9 flex-1 rounded-xl text-[13px]"
                onClick={() => {
                  request.secondaryAction?.onClick();
                  onClose?.();
                }}
              >
                {request.secondaryAction.label}
              </Button>
            )}
            {onRetry ? (
              <Button
                variant="secondary"
                className="h-9 flex-1 rounded-xl text-[13px]"
                onClick={onRetry}
              >
                {t("action.retryConnect")}
              </Button>
            ) : !request.critical && onClose ? (
              <Button
                variant="ghost"
                className="h-9 flex-1 rounded-xl text-[13px]"
                onClick={onClose}
              >
                {t("action.later")}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** 移动端全局通用升级弹层：挂载于 mobile AppShell。 */
export function UpgradePromptSheet() {
  const open = useMobileUpgradePromptStore(s => s.open);
  const request = useMobileUpgradePromptStore(s => s.request);
  const close = useMobileUpgradePromptStore(s => s.close);

  if (!request) return null;
  return (
    <BottomSheet
      open={open}
      onClose={close}
      dismissible={!request.critical}
      backDismiss={!request.critical}
    >
      <UpgradePromptBody request={request} active={open} onClose={close} />
    </BottomSheet>
  );
}

/** 移动端启动阶段嵌入式通用升级卡片（用于 DB_MODEL_INCOMPATIBLE 等阻断启动的场景）。 */
export function MobileStartupUpgradeCard({
  request,
  onRetry,
}: {
  request: UpgradePromptRequest;
  onRetry: () => void;
}) {
  return (
    <main className="bg-page flex min-h-dvh items-center justify-center px-5 py-8">
      <div
        role="alertdialog"
        className="bg-surface border-line-1 shadow-card w-full max-w-sm rounded-3xl border p-5"
      >
        <UpgradePromptBody request={request} active onRetry={onRetry} />
      </div>
    </main>
  );
}
