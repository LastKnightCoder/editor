/** 用户反馈的客户端视图，字段与上限以 apps/plugin-portal/contracts 的 AppFeedback* 为准。 */

export type AppFeedbackKind = "bug" | "idea" | "other";

export const APP_FEEDBACK_LIMITS = {
  message: 4000,
  contact: 200,
  images: 3,
  imageBytes: 1536 * 1024,
  logBytes: 3 * 1024 * 1024,
} as const;

export interface AppFeedbackSubmitInput {
  kind: AppFeedbackKind;
  message: string;
  contact: string | null;
  /** 同一份草稿重试复用，服务端据此去重 */
  clientRequestId: string;
  includeContext: boolean;
  /** 主题名 · 明暗；由渲染端提供 */
  theme: string | null;
  /** 不传则用打开反馈窗口时记录的页面 */
  page?: string | null;
  /** 已在渲染端打码、压缩好的 WebP */
  images: Uint8Array[];
  logs: { app: boolean; perf: boolean };
}

export type AppFeedbackFailure = "network" | "limit" | "invalid" | "forbidden" | "server";

export type AppFeedbackResult =
  { ok: true; id: string } | { ok: false; reason: AppFeedbackFailure; message: string };

export interface AppFeedbackEnvironment {
  appVersion: string;
  platform: string;
  osVersion: string;
  arch: string;
  page: string | null;
  locale: string;
}

export interface AppFeedbackLogInfo {
  /** 将附带的普通日志原始字节数（本次运行 + 上次运行的尾部） */
  appLogBytes: number;
}

export interface FeedbackCaptureSource {
  id: number;
  label: string;
}

export interface FeedbackCapture {
  png: Uint8Array;
  source: string;
}

export interface AppFeedbackOpenOptions {
  /** 主窗口栈顶页面 key，作为环境信息里的「当前页面」 */
  page?: string | null;
  /** 先截取发起窗口，再打开反馈窗口 */
  capture?: boolean;
}
