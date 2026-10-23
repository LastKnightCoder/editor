import type { CenterReason } from "@tau/plugins/center";
import type { PluginManagerAction } from "../data/usePluginManager";
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
  downloading: { label: "下载中", tone: "info" },
  verifying: { label: "校验中", tone: "info" },
  pending: { label: "待生效", tone: "warn" },
  running: { label: "运行中", tone: "ok" },
  inactive: { label: "未运行", tone: "neutral" },
  disabled: { label: "已停用", tone: "neutral" },
  failed: { label: "失败", tone: "danger" },
  revoked: { label: "已撤回", tone: "danger" },
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
      return "取消下载";
    case "cancelPending":
      return "取消待生效更新";
    case "retry":
      return "重试";
    case "update":
      return action.version ? `更新到 v${action.version}` : "更新";
    case "enable":
      return "启用";
    case "disable":
      return "停用";
    case "uninstall":
      return "卸载";
    case "clearData":
      return "清除此工作区数据";
    case "restore":
      return "恢复上一版代码";
  }
}

/** 结构化原因的完整文案，附带所需版本或缺失能力。 */
export function reasonLabel(reason: CenterReason): string {
  switch (reason.code) {
    case "FORMAT_UNSUPPORTED":
      return `当前应用不支持包格式 ${reason.formatVersion}`;
    case "API_UNSUPPORTED":
      return `当前应用不支持插件接口版本 ${reason.apiVersion}`;
    case "PROFILE_UNSUPPORTED":
      return `当前应用未接入运行配置 ${reason.profile}`;
    case "PLATFORM_UNSUPPORTED":
      return `插件未声明支持${PLATFORM_LABELS[reason.platform]}`;
    case "APP_VERSION_TOO_LOW":
      return `需要将 Tau 更新到 ${reason.minAppVersion} 或更高版本`;
    case "CAPABILITY_MISSING":
      return `当前应用缺少插件必需的能力：${reason.capabilities.join("、")}`;
    case "DISTRIBUTION_UNAVAILABLE":
      return "此平台的插件安装尚未开放";
    case "REVOKED":
      return "该版本已撤回";
    case "PLUGIN_DISABLED":
      return "插件已被停止公开";
    case "NO_RELEASE":
      return "没有已发布的版本";
  }
}
