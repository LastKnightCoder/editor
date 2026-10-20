import type { TagColor } from "@tau/ui";
import type { AppFeedbackKind, AppFeedbackStatus } from "../../../../contracts";

export const KIND_LABELS: Record<AppFeedbackKind, string> = {
  bug: "问题",
  idea: "建议",
  other: "其他",
};
export const KIND_COLORS: Record<AppFeedbackKind, TagColor> = {
  bug: "red",
  idea: "blue",
  other: "purple",
};
export const STATUS_LABELS: Record<AppFeedbackStatus, string> = {
  new: "新反馈",
  doing: "处理中",
  done: "已解决",
  ignored: "已忽略",
};
export const STATUS_COLORS: Record<AppFeedbackStatus, TagColor> = {
  new: "orange",
  doing: "yellow",
  done: "green",
  ignored: "gray",
};
export const STATUSES = Object.keys(STATUS_LABELS) as AppFeedbackStatus[];

const PLATFORM_LABELS: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};
export const platformLabel = (platform: string | null | undefined) =>
  platform ? (PLATFORM_LABELS[platform] ?? platform) : null;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
