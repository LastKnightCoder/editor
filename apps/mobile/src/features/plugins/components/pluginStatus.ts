import { pluginTranslator } from "../i18n";
const t = pluginTranslator.t;
import type { CenterReason } from "@tau/plugins/center";
import type { ManagedPluginItem, PluginManagerAction } from "../data/usePluginManager";
import type { StoreTaskPhase } from "./StoreActionButton";
import { PLATFORM_LABELS } from "./centerDisplay";

/** 已安装插件的客户端状态投影，由逻辑层生成；不是中心审核状态。 */
export type PluginLifecycleView =
  | { kind: "downloading"; progress: number | null }
  | { kind: "verifying" }
  /** version 为 null 表示清单只知道有待生效版本、不知道版本号。 */
  | { kind: "pending"; version: string | null }
  | { kind: "running" }
  /** 已保存启用意图，但当前会话未运行。 */
  | { kind: "inactive" }
  | { kind: "disabled" }
  | { kind: "failed"; message: string }
  | { kind: "revoked"; reason: string | null };

/** 数据层已提供的管理动作，加上商店更新、重试与下载取消。 */
export type PluginActionKind = PluginManagerAction | "update" | "retry" | "cancelInstall";

/** 一个动作及其是否允许；不允许时 reason 说明原因。 */
export interface PluginActionView {
  kind: PluginActionKind;
  allowed: boolean;
  reason?: string | null;
  /** update 的目标版本。 */
  version?: string;
}

export type StatusTone = "info" | "warn" | "ok" | "neutral" | "danger";

export const STATUS_DISPLAY: Record<
  PluginLifecycleView["kind"],
  { label: string; tone: StatusTone }
> = {
  downloading: {
    get label() {
      return t("status.downloading");
    },
    tone: "info",
  },
  verifying: {
    get label() {
      return t("status.verifying");
    },
    tone: "info",
  },
  pending: {
    get label() {
      return t("status.pending");
    },
    tone: "warn",
  },
  running: {
    get label() {
      return t("status.running");
    },
    tone: "ok",
  },
  inactive: {
    get label() {
      return t("status.inactive");
    },
    tone: "neutral",
  },
  disabled: {
    get label() {
      return t("status.disabled");
    },
    tone: "neutral",
  },
  failed: {
    get label() {
      return t("status.failed");
    },
    tone: "danger",
  },
  revoked: {
    get label() {
      return t("status.revoked");
    },
    tone: "danger",
  },
};

export const TONE_CLASS: Record<StatusTone, string> = {
  info: "bg-info-soft text-info",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  neutral: "bg-page text-ink-2",
  danger: "bg-danger-soft text-danger",
};

export function actionLabel(action: PluginActionView): string {
  switch (action.kind) {
    case "cancelInstall":
      return t("install.cancelDownload");
    case "cancelPending":
      return t("manage.cancelPending");
    case "retry":
      return t("common.retry");
    case "update":
      return action.version
        ? t("install.updateVersion", { version: action.version })
        : t("common.update");
    case "enable":
      return t("common.enable");
    case "disable":
      return t("common.disable");
    case "uninstall":
      return t("common.uninstall");
    case "clearData":
      return t("manage.clearWorkspace");
    case "restore":
      return t("manage.restoreCode");
  }
}

/** 结构化原因的完整文案，附带所需版本或缺失能力。 */
export function reasonLabel(reason: CenterReason): string {
  switch (reason.code) {
    case "FORMAT_UNSUPPORTED":
      return t("reason.format", { format: reason.formatVersion });
    case "API_UNSUPPORTED":
      return t("reason.api", { version: reason.apiVersion });
    case "PROFILE_UNSUPPORTED":
      return t("reason.profile", { profile: reason.profile });
    case "PLATFORM_UNSUPPORTED":
      return t("reason.platform", { platform: PLATFORM_LABELS[reason.platform] });
    case "APP_VERSION_TOO_LOW":
      return t("reason.appVersion", { version: reason.minAppVersion });
    case "DISTRIBUTION_UNAVAILABLE":
      return t("reason.distribution");
    case "REVOKED":
      return t("reason.revoked");
    case "PLUGIN_DISABLED":
      return t("reason.disabled");
    case "NO_RELEASE":
      return t("reason.noRelease");
  }
}

/** 已安装插件的状态投影：安装任务优先，其次撤回、失败、待生效、运行与启用意图。 */
export function lifecycleOf(
  item: ManagedPluginItem,
  phase: StoreTaskPhase = null,
  taskError?: unknown
): PluginLifecycleView {
  if (phase === "checking") return { kind: "verifying" };
  if (phase === "downloading" || phase === "queued") return { kind: "downloading", progress: null };
  if (item.revoked) return { kind: "revoked", reason: item.revoked.reason };
  if (phase === "failed") return { kind: "failed", message: String(taskError) };
  if (item.error) return { kind: "failed", message: item.error };
  if (item.pending) return { kind: "pending", version: item.pendingVersion ?? null };
  if (item.active) return { kind: "running" };
  return item.enabled ? { kind: "inactive" } : { kind: "disabled" };
}

/** 已保存但当前会话尚未体现的变更：待生效包，或启用意图与运行状态不一致。 */
export const hasPendingChange = (item: ManagedPluginItem) =>
  item.pending || (!item.error && !item.revoked && item.enabled !== item.active);
