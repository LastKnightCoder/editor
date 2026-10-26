// 用户反馈的宿主通道封装：截图分块暂存与提交走 Rust（app_feedback 命令），
// 字段上限以 apps/plugin-portal/contracts 的 AppFeedback* 为准。

import { invoke } from "@tauri-apps/api/core";

export type AppFeedbackKind = "bug" | "idea" | "other";

export const APP_FEEDBACK_LIMITS = {
  message: 4000,
  contact: 200,
  images: 3,
  imageBytes: 1536 * 1024,
} as const;

export class MobileFeedbackError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "MobileFeedbackError";
  }
}

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(name, args);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && "message" in error) {
      const issue = error as { status: number; code: string; message: string };
      throw new MobileFeedbackError(issue.status, issue.code, issue.message);
    }
    throw error;
  }
}

export interface FeedbackUiContext {
  osVersion: string;
  theme: string;
  locale: string;
}

export interface FeedbackSubmitInput {
  kind: AppFeedbackKind;
  message: string;
  includeContext: boolean;
  uiContext: FeedbackUiContext;
  /** 同一份草稿重试复用，服务端据此去重 */
  clientRequestId: string;
  imageIds: string[];
  includeLogs: boolean;
}

export type FeedbackSubmitResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "network" | "limit" | "invalid" | "forbidden" | "server";
      message: string;
    };

// Android 保留字符串 IPC，每次只编码当前块（与 uploadResource 同一模式）
const IMAGE_CHUNK_BYTES = 256 * 1024;

/** 把压缩好的截图分块写入 Rust 暂存区，返回后即可在提交时引用该 id */
export async function stageFeedbackImage(id: string, bytes: Uint8Array): Promise<void> {
  for (let offset = 0; offset < bytes.length; offset += IMAGE_CHUNK_BYTES) {
    const slice = bytes.subarray(offset, Math.min(offset + IMAGE_CHUNK_BYTES, bytes.length));
    let binary = "";
    for (let index = 0; index < slice.length; index += 32768)
      binary += String.fromCharCode(...slice.subarray(index, index + 32768));
    await command("app_feedback_image_write", { id, offset, chunk: btoa(binary) });
  }
}

export function discardFeedbackImage(id: string): void {
  void command("app_feedback_image_discard", { id }).catch(() => undefined);
}

export function submitFeedback(input: FeedbackSubmitInput): Promise<FeedbackSubmitResult> {
  return command<FeedbackSubmitResult>("app_feedback_submit", { input });
}
