// 最近一次图片/附件上传的结果：编辑器上传管线写入，「图片与附件」页读取展示，
// 编辑器失败提示据此补上原因与「去设置」入口。只在本机记录，不涉及远端。

import { mapErrorToMessage, parseInvokeError } from "./errors";

/** 失败类别决定设置页给出的修复入口 */
export type UploadFailureKind = "config" | "auth" | "location" | "network" | "local" | "unknown";

export type UploadOutcome =
  | { ok: true; providerId: string; at: number }
  | {
      ok: false;
      providerId: string;
      at: number;
      kind: UploadFailureKind;
      message: string;
    };

const STORAGE_KEY = "tau.mobile.lastUpload";
/** 编辑器的失败提示紧跟在上传失败之后，超过这个间隔就不再视为同一次失败 */
const RECENT_FAILURE_WINDOW_MS = 3000;

const listeners = new Set<() => void>();
let cached: UploadOutcome | null | undefined;
let recentFailure: Extract<UploadOutcome, { ok: false }> | null = null;

function extractHttpStatus(detail: string): number | null {
  const match = detail.match(/HTTP\s+(\d{3})/i) ?? detail.match(/\b(40[1-4])\b/);
  return match ? Number(match[1]) : null;
}

/** 把上传 invoke 错误翻译成类别与一句用户可读的原因 */
export function classifyUploadError(error: unknown): { kind: UploadFailureKind; message: string } {
  const { code, message } = parseInvokeError(error);
  if (code === "RESOURCE_CONFIG_MISSING") {
    return { kind: "config", message: message || "上传位置的配置不完整" };
  }
  if (code === "RESOURCE_WRITE_FAILED") {
    return { kind: "local", message: "写入本机失败，请检查存储空间" };
  }
  if (code === "RESOURCE_UPLOAD_TIMEOUT") {
    return { kind: "network", message: "网络不通或太慢，请稍后重试" };
  }
  const status = extractHttpStatus(message);
  if (status === 401 || status === 403) {
    return { kind: "auth", message: "账号已失效或没有写入权限" };
  }
  if (status === 404) {
    return { kind: "location", message: "找不到仓库或存储桶" };
  }
  if (/timed?\s*out|connect|dns|network|超时/i.test(message)) {
    return { kind: "network", message: "网络不通或太慢，请稍后重试" };
  }
  return { kind: "unknown", message: mapErrorToMessage(code, message || "上传失败") };
}

export function readUploadOutcome(): UploadOutcome | null {
  if (cached !== undefined) return cached;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as UploadOutcome) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function recordUploadSuccess(providerId: string): void {
  recentFailure = null;
  save({ ok: true, providerId, at: Date.now() });
}

export function recordUploadFailure(providerId: string, error: unknown): void {
  const outcome = { ok: false as const, providerId, at: Date.now(), ...classifyUploadError(error) };
  recentFailure = outcome;
  save(outcome);
}

/** 取走紧随其后的那次上传失败（只取一次），供编辑器失败提示补充原因 */
export function takeRecentUploadFailure(): Extract<UploadOutcome, { ok: false }> | null {
  const failure = recentFailure;
  recentFailure = null;
  if (!failure || Date.now() - failure.at > RECENT_FAILURE_WINDOW_MS) return null;
  return failure;
}

export function subscribeUploadOutcome(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function save(outcome: UploadOutcome): void {
  cached = outcome;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(outcome));
  } catch {
    // 存储不可用时只是设置页不显示最近结果
  }
  listeners.forEach(listener => listener());
}

/** 仅供测试重置模块内缓存 */
export function resetUploadOutcomeForTest(): void {
  cached = undefined;
  recentFailure = null;
}
