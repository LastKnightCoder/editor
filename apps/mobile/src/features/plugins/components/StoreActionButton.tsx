import { pluginTranslator, usePluginI18n } from "../i18n";
import { cn } from "@tau/ui";
import { storeActionReason, type StorePrimaryAction } from "./storeActions";
const t = pluginTranslator.t;

/** 本插件当前的中心安装任务阶段；无任务时为 null。 */
export type StoreTaskPhase = "queued" | "downloading" | "checking" | "failed" | null;

const SIZE = {
  sm: "h-[30px] min-w-[62px] rounded-full px-3.5 text-[13px]",
  lg: "h-11 flex-1 rounded-[14px] px-4 text-[15px]",
};
const TONE = {
  get: "bg-accent-soft text-accent-text",
  update: "bg-accent text-ink-inverse",
  pending: "bg-warn-soft text-warn",
  muted: "bg-page text-ink-3 font-medium",
  plain: "text-ink-3 font-medium",
  danger: "bg-danger-soft text-danger",
};

function ProgressRing({ spinning }: { spinning: boolean }) {
  usePluginI18n();
  return (
    <span className="relative grid size-[30px] place-items-center">
      <svg viewBox="0 0 30 30" className="absolute inset-0 animate-spin" aria-hidden>
        <circle cx="15" cy="15" r="12" fill="none" strokeWidth="2.5" className="stroke-line-1" />
        <circle
          cx="15"
          cy="15"
          r="12"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={spinning ? "18 58" : "30 46"}
          className="stroke-accent"
        />
      </svg>
      {!spinning && <span className="bg-accent size-2 rounded-[2px]" />}
    </span>
  );
}

/**
 * 商店主按钮：列表行（sm）与详情头部（lg）共用同一状态机。
 * 排队与下载中点按即取消；校验阶段不可取消；失败可重试。
 */
export function StoreActionButton({
  primary,
  phase = null,
  size = "sm",
  onPress,
  onCancel,
  onRetry,
}: {
  primary: StorePrimaryAction;
  phase?: StoreTaskPhase;
  size?: keyof typeof SIZE;
  onPress: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  usePluginI18n();
  const large = size === "lg";
  const base = cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-bold transition active:scale-95 disabled:opacity-50 disabled:active:scale-100",
    SIZE[size]
  );
  if (phase === "queued" || phase === "downloading" || phase === "checking") {
    const checking = phase === "checking";
    if (!large)
      return (
        <button
          type="button"
          aria-label={checking ? t("install.checking") : t("install.cancelDownload")}
          disabled={checking}
          onClick={onCancel}
          className="shrink-0 disabled:opacity-100"
        >
          <ProgressRing spinning={checking} />
        </button>
      );
    return (
      <button
        type="button"
        disabled={checking}
        onClick={onCancel}
        className={cn(base, TONE.muted, "disabled:opacity-100")}
      >
        <span className="scale-75">
          <ProgressRing spinning={checking} />
        </span>
        {checking
          ? t("install.checkingBusy")
          : phase === "queued"
            ? t("install.queuedCancel")
            : t("install.downloadingCancel")}
      </button>
    );
  }
  if (phase === "failed")
    return (
      <button type="button" onClick={onRetry} className={cn(base, TONE.danger)}>
        {large ? t("install.retry") : t("common.retry")}
      </button>
    );
  switch (primary.kind) {
    case "install":
    case "update": {
      const update = primary.kind === "update";
      return (
        <button
          type="button"
          disabled={!primary.allowed}
          title={storeActionReason(primary)}
          onClick={onPress}
          className={cn(base, update ? TONE.update : TONE.get)}
        >
          {large
            ? t(update ? "install.updateVersion" : "install.installVersion", {
                version: primary.version,
              })
            : update
              ? t("common.update")
              : t("center.get")}
        </button>
      );
    }
    case "pending":
      return (
        <span className={cn(base, TONE.pending, "active:scale-100")}>
          {large && primary.version
            ? t("install.pendingVersion", { version: primary.version })
            : t("install.pending")}
        </span>
      );
    case "installed":
      return (
        <span className={cn(base, large ? TONE.muted : TONE.plain, "active:scale-100")}>
          {large
            ? t("install.installedVersion", { version: primary.version })
            : t("common.installed")}
        </span>
      );
    case "unavailable":
      return (
        <span className={cn(base, TONE.muted, "active:scale-100")}>
          {large ? t("install.unavailable") : t("center.unavailable")}
        </span>
      );
  }
}
