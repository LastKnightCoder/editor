import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzip as gzipCallback } from "node:zlib";
import {
  APP_FEEDBACK_LIMITS,
  type AppFeedbackFailure,
  type AppFeedbackResult,
  type AppFeedbackSubmitInput,
} from "@/types/app-feedback";

/**
 * 反馈提交的 electron-free 部分：日志收集、multipart 组包、响应归类。
 * 网络与匿名凭证由调用方注入，便于单测。
 */

const gzip = promisify(gzipCallback);

// 本次运行取尾部 2 MiB，上次运行取 1 MiB：卡死/崩溃后重开时，问题多在上一份日志里
const CURRENT_LOG_TAIL = 2 * 1024 * 1024;
const PREVIOUS_LOG_TAIL = 1024 * 1024;

async function readTail(file: string, maxBytes: number): Promise<string | null> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(file, "r");
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const text = buffer.toString("utf8");
    // 截断处可能落在多字节字符或行中间，丢掉第一行残片
    return size > maxBytes ? text.slice(text.indexOf("\n") + 1) : text;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

/** 本次运行之前最近的一份 session 日志（轮转产物 .old.log 不算） */
async function previousSessionLog(logDir: string, current: string): Promise<string | null> {
  try {
    const names = (await fs.readdir(logDir))
      .filter(
        name =>
          name.startsWith("session-") &&
          name.endsWith(".log") &&
          !name.endsWith(".old.log") &&
          path.join(logDir, name) !== current
      )
      .sort();
    return names.length ? path.join(logDir, names[names.length - 1]) : null;
  } catch {
    return null;
  }
}

export async function logFileBytes(logDir: string, current: string): Promise<number> {
  const size = async (file: string | null, cap: number) =>
    file
      ? await fs
          .stat(file)
          .then(stat => Math.min(stat.size, cap))
          .catch(() => 0)
      : 0;
  return (
    (await size(current, CURRENT_LOG_TAIL)) +
    (await size(await previousSessionLog(logDir, current), PREVIOUS_LOG_TAIL))
  );
}

export async function collectAppLog(logDir: string, current: string): Promise<Buffer> {
  const previous = await previousSessionLog(logDir, current);
  const sections = [{ file: current, content: await readTail(current, CURRENT_LOG_TAIL) }];
  if (previous)
    sections.push({ file: previous, content: await readTail(previous, PREVIOUS_LOG_TAIL) });
  const text = sections
    .filter(section => section.content !== null)
    .map(section => `===== ${path.basename(section.file)} =====\n${section.content}`)
    .join("\n\n");
  return gzip(text || "（没有可用的日志）");
}

/** 性能快照超限时依次去掉体积最大的启动 CPU 剖析，仍超限则放弃 */
export async function compressPerfSnapshot(snapshot: {
  main: Record<string, unknown>;
}): Promise<Buffer> {
  const packed = await gzip(JSON.stringify(snapshot));
  if (packed.length <= APP_FEEDBACK_LIMITS.logBytes) return packed;
  const trimmed = await gzip(
    JSON.stringify({ ...snapshot, main: { ...snapshot.main, startupCpuProfile: null } })
  );
  if (trimmed.length <= APP_FEEDBACK_LIMITS.logBytes) return trimmed;
  throw new Error("性能日志过大，请取消勾选后再发送");
}

export interface FeedbackRequestParts {
  meta: {
    kind: AppFeedbackSubmitInput["kind"];
    message: string;
    context: Record<string, string> | null;
    clientRequestId: string;
  };
  images: Uint8Array[];
  log: Uint8Array | null;
  perf: Uint8Array | null;
}

export function validateInput(input: AppFeedbackSubmitInput) {
  const message = input.message.trim();
  if (!message || message.length > APP_FEEDBACK_LIMITS.message)
    throw new Error(`反馈内容需要 1 至 ${APP_FEEDBACK_LIMITS.message} 字`);
  if (input.images.length > APP_FEEDBACK_LIMITS.images)
    throw new Error(`最多附带 ${APP_FEEDBACK_LIMITS.images} 张截图`);
  if (input.images.some(image => image.byteLength > APP_FEEDBACK_LIMITS.imageBytes))
    throw new Error("截图过大，请重新截取");
  return { message };
}

/** 用标准 Request 序列化 multipart，得到可交给 net.fetch 的字节与带 boundary 的类型 */
export async function encodeFeedback(parts: FeedbackRequestParts) {
  const form = new FormData();
  form.set("meta", JSON.stringify(parts.meta));
  for (const image of parts.images)
    form.append(
      "image",
      new Blob([new Uint8Array(image)], { type: "image/webp" }),
      "screenshot.webp"
    );
  if (parts.log)
    form.set(
      "log",
      new Blob([new Uint8Array(parts.log)], { type: "application/gzip" }),
      "app.log.gz"
    );
  if (parts.perf)
    form.set(
      "perf",
      new Blob([new Uint8Array(parts.perf)], { type: "application/gzip" }),
      "perf.json.gz"
    );
  const request = new Request("http://feedback.local", { method: "POST", body: form });
  return {
    body: new Uint8Array(await request.arrayBuffer()),
    contentType: request.headers.get("Content-Type") ?? "multipart/form-data",
  };
}

const FAILURES: [number, AppFeedbackFailure][] = [
  [429, "limit"],
  [400, "invalid"],
  [413, "invalid"],
  [403, "forbidden"],
];

export async function readFeedbackResponse(response: Response): Promise<AppFeedbackResult> {
  const body = (await response.json().catch(() => null)) as {
    data?: { id?: string };
    error?: { message?: string };
  } | null;
  if (response.ok && typeof body?.data?.id === "string") return { ok: true, id: body.data.id };
  const reason = FAILURES.find(([status]) => status === response.status)?.[1] ?? "server";
  return {
    ok: false,
    reason,
    message: body?.error?.message || `反馈服务暂时不可用（${response.status}）`,
  };
}
